import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ImapFlow, ImapFlowOptions } from 'imapflow';
import { simpleParser } from 'mailparser';
import { AgentRun } from '../entities/agent-run.entity';
import { ApprovalRequest } from '../entities/approval-request.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { AgentEvents, VendorRespondedEvent } from '../agent-events';
import {
  NegotiationOffer,
  computeCompositeValue,
  computeOrderValueFromItems,
  computeVendorConcessionPts,
  paymentTermsOf,
  shippingCostOf,
} from '../negotiation-composite.util';
import { VendorChannelService } from './vendor-channel.service';
import { VendorReplyParser } from './vendor-reply.parser';
import { NEG_TAG_PREFIX, VendorReply } from './vendor-channel.types';

const RUN_ID_RE = new RegExp(
  `${NEG_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})]`,
  'i',
);

/**
 * Receives vendor replies by polling the system mailbox over IMAP.
 * Correlates each message to a negotiation run (subject tag, then sender
 * fallback), parses the reply, and emits the same VENDOR_RESPONDED event the
 * simulated vendor emits — so the negotiation state machine continues
 * unchanged. Only runs when VENDOR_CHANNEL=email.
 */
@Injectable()
export class VendorInboundMailService {
  private readonly logger = new Logger(VendorInboundMailService.name);
  private isPolling = false;

  constructor(
    private readonly config: ConfigService,
    private readonly channel: VendorChannelService,
    private readonly parser: VendorReplyParser,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async poll(): Promise<void> {
    if (!this.channel.isEmailEnabled()) return;
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      await this.pollOnce();
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${(err as Error).message}`);
    } finally {
      this.isPolling = false;
    }
  }

  /** Public entry for manual/API-triggered polls. */
  async pollOnce(): Promise<void> {
    const host = this.config.get<string>('IMAP_HOST');
    const user = this.config.get<string>('IMAP_USER');
    const pass = this.config.get<string>('IMAP_PASS');
    if (!host || !user || !pass) {
      this.logger.warn('IMAP_HOST/USER/PASS are not configured — skipping inbound poll.');
      return;
    }

    const client = new ImapFlow({
      host,
      port: parseInt(this.config.get<string>('IMAP_PORT', '993'), 10),
      secure: this.config.get<string>('IMAP_TLS', 'true') !== 'false',
      auth: { user, pass },
      logger: false,
    } as ImapFlowOptions);

    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) {
          this.logger.log('No unseen messages in the vendor inbox.');
          return;
        }
        this.logger.log(`Found ${uids.length} unseen message(s) to process.`);
        for (const uid of uids) {
          try {
            const msg = await client.fetchOne(
              uid,
              { source: true, uid: true },
              { uid: true },
            );
            if (msg && msg.source) {
              await this.handleMessage(uid, msg.source, client);
            }
          } catch (err) {
            this.logger.error(`Failed to process UID ${uid}: ${(err as Error).message}`);
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  private async handleMessage(
    uid: number,
    source: Buffer,
    client: ImapFlow,
  ): Promise<void> {
    let parsed;
    try {
      parsed = await simpleParser(source);
    } catch (err) {
      this.logger.warn(`Could not parse UID ${uid}: ${(err as Error).message}`);
      return;
    }

    const subject = parsed.subject ?? '';
    const from = extractAddress(parsed.from);
    const body = parsed.text ?? '';

    const runId = extractRunId(subject) ?? (await this.matchBySender(from));
    if (!runId) {
      this.logger.warn(
        `No negotiation run matched for email from "${from}" subject "${subject}" — leaving it in the inbox.`,
      );
      return;
    }

    const run = await this.loadRun(runId);
    if (!run) {
      this.logger.warn(`Matched run ${runId} no longer exists — marking email as seen.`);
      await markSeen(client, uid);
      return;
    }

    // Idempotency: only a run waiting for a reply can absorb one.
    if (run.status !== 'awaiting_vendor_response' && run.status !== 'sent') {
      this.logger.log(
        `Run ${runId} is ${run.status} — ignoring stale reply, marking email as seen.`,
      );
      await markSeen(client, uid);
      return;
    }

    // Sender must match the vendor on the run (best-effort, when we know it).
    if (run.relatedVendorId) {
      const vendor = await this.loadVendor(run.relatedVendorId);
      if (vendor?.contactEmail && !sameAddress(from, vendor.contactEmail)) {
        this.logger.warn(
          `Sender "${from}" does not match vendor ${vendor.contactEmail} for run ${runId} — leaving in inbox.`,
        );
        return;
      }
    }

    const reply = await this.parser.parseReply(body);
    const lastOffer = await this.lastOffer(run.tenantId, run.id);
    const event = await this.buildRespondedEvent(run, reply, lastOffer, `email-${uid}`);

    this.eventEmitter.emit(AgentEvents.VENDOR_RESPONDED, event);
    await markSeen(client, uid);
    this.logger.log(
      `Processed vendor reply for run ${run.id}: accepted=${event.accepted} counter=${event.counterDiscountPercent}%`,
    );
  }

  /** Public for tests: builds the same event the simulated vendor produces. */
  async buildRespondedEvent(
    run: AgentRun,
    reply: VendorReply,
    lastOffer: NegotiationOffer | null,
    offerId: string,
  ): Promise<VendorRespondedEvent> {
    const offered = lastOffer?.discountPercent ?? 0;
    const orderValue = await this.computeOrderValue(run);
    const discount = reply.accepted ? offered : (reply.counterDiscountPercent ?? offered);
    const termsDays = paymentTermsOf({
      discountPercent: 0,
      paymentTermsDays: reply.paymentTermsDays ?? lastOffer?.paymentTermsDays ?? 30,
    });
    const shipping = shippingCostOf({
      discountPercent: 0,
      shippingCost: reply.shippingCost ?? lastOffer?.shippingCost ?? 50,
    });

    const composite = computeCompositeValue(
      { discountPercent: discount, paymentTermsDays: termsDays, shippingCost: shipping },
      orderValue,
    );
    const concessionPts = computeVendorConcessionPts(
      { discountPercent: discount, paymentTermsDays: termsDays, shippingCost: shipping },
      orderValue,
    );

    return {
      tenantId: run.tenantId,
      offerId,
      negotiationRunId: run.id,
      vendorId: run.relatedVendorId ?? '',
      roundNumber: run.roundNumber,
      offeredDiscountPercent: offered,
      paymentTermsDays: termsDays,
      shippingCost: shipping,
      orderValue: composite.orderValue,
      compositeValueUSD: composite.compositeValueUSD,
      concessionPts,
      accepted: reply.accepted,
      counterDiscountPercent: reply.accepted ? null : discount,
      counterPaymentTermsDays: reply.paymentTermsDays,
      counterShippingCost: reply.shippingCost,
      message: reply.message,
    };
  }

  private async loadRun(runId: string): Promise<AgentRun | null> {
    try {
      return await this.dataSource.getRepository(AgentRun).findOne({ where: { id: runId } });
    } catch (err) {
      this.logger.warn(`Failed to load run ${runId}: ${(err as Error).message}`);
      return null;
    }
  }

  private async loadVendor(vendorId: string): Promise<Vendor | null> {
    try {
      return await this.dataSource.getRepository(Vendor).findOne({ where: { id: vendorId } });
    } catch {
      return null;
    }
  }

  /** Fallback correlation: sender matches a vendor with an open negotiation. */
  private async matchBySender(from: string): Promise<string | null> {
    if (!from) return null;
    try {
      const vendor = await this.dataSource
        .getRepository(Vendor)
        .createQueryBuilder('vendor')
        .where('LOWER(vendor.contactEmail) = LOWER(:from)', { from })
        .getOne();
      if (!vendor) return null;
      const run = await this.dataSource
        .getRepository(AgentRun)
        .findOne({
          where: {
            relatedVendorId: vendor.id,
            agentType: 'negotiation',
            status: 'awaiting_vendor_response',
          },
          order: { updatedAt: 'DESC' },
        });
      return run?.id ?? null;
    } catch (err) {
      this.logger.warn(`Sender fallback match failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** The discount/terms/shipping of the most recently drafted offer for a run. */
  private async lastOffer(tenantId: string, runId: string): Promise<NegotiationOffer | null> {
    try {
      const approval = await this.dataSource.getRepository(ApprovalRequest).findOne({
        where: { tenantId, agentRunId: runId, agentType: 'negotiation', stepNumber: 1 },
        order: { createdAt: 'DESC' },
      });
      if (!approval) return null;
      const payload = (approval.payload ?? {}) as Record<string, unknown>;
      return {
        discountPercent: Math.max(
          0,
          Number(payload.requestedDiscountPercent ?? payload.finalDiscountPercent ?? 0),
        ),
        paymentTermsDays: Math.max(30, Math.round(Number(payload.paymentTermsDays) || 30)),
        shippingCost: Math.max(0, Number(payload.shippingCost) || 50),
      };
    } catch {
      return null;
    }
  }

  private async computeOrderValue(run: AgentRun): Promise<number> {
    try {
      const fromItems = computeOrderValueFromItems(run.negotiationItems as never);
      if (fromItems > 0) return fromItems;
    } catch {
      /* fall through to PO */
    }
    if (!run.relatedPoId) return 0;
    try {
      const po = await this.dataSource
        .getRepository(PurchaseOrder)
        .findOne({
          where: { id: run.relatedPoId, tenantId: run.tenantId },
          relations: { lineItems: true },
        });
      if (!po) return 0;
      return computeOrderValueFromItems((po.lineItems ?? []) as never);
    } catch {
      return 0;
    }
  }
}

/** Extract a run UUID from a "[StockSavvy NEG-<uuid>]" subject tag. */
export function extractRunId(subject: string): string | null {
  if (!subject) return null;
  const match = subject.match(RUN_ID_RE);
  return match ? match[1].toLowerCase() : null;
}

export function extractAddress(address: unknown): string {
  try {
    const list = Array.isArray(address) ? address : address ? [address] : [];
    const first = list[0] as { value?: Array<{ address?: string }> } | undefined;
    return first?.value?.[0]?.address?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase().replace(/^.+<|>$/g, '').trim() ===
    b.toLowerCase().replace(/^.+<|>$/g, '').trim();
}

async function markSeen(client: ImapFlow, uid: number): Promise<void> {
  try {
    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
  } catch (err) {
    // Non-fatal: the poll guard prevents reprocessing anyway.
  }
}
