import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SimulatedVendorService } from '../simulated-vendor.service';
import { AgentRun } from '../entities/agent-run.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';
import { NegotiationOffer } from '../negotiation-composite.util';
import { VendorEmailService } from './vendor-email.service';

/**
 * Chooses how a step-1 "Vendor Outreach" approval is delivered:
 *  - VENDOR_CHANNEL=email and the vendor has a contact email → real SMTP email.
 *  - otherwise → the existing simulated vendor (fallback / demo mode).
 */
@Injectable()
export class VendorChannelService {
  private readonly logger = new Logger(VendorChannelService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly simulatedVendorService: SimulatedVendorService,
    private readonly vendorEmailService: VendorEmailService,
  ) {}

  isEmailEnabled(): boolean {
    return this.config.get<string>('VENDOR_CHANNEL', 'simulated') === 'email';
  }

  async dispatchOffer(
    tenantId: string,
    approvalId: string,
    runId: string,
    offer: NegotiationOffer,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (this.isEmailEnabled()) {
      const vendor = await this.loadVendor(tenantId, runId);
      if (vendor?.contactEmail) {
        if (!this.vendorEmailService.isConfigured()) {
          throw new Error(
            'VENDOR_CHANNEL=email is set but SMTP credentials (SMTP_HOST/USER/PASS) are missing.',
          );
        }
        await this.vendorEmailService.sendOffer({
          tenantId,
          runId,
          approvalId,
          vendorId: vendor.id,
          to: vendor.contactEmail,
          subject: String(payload.subject ?? ''),
          text: String(payload.emailContent ?? ''),
          offer,
        });
        this.logger.log(
          `Offer for run ${runId} sent by email to ${vendor.contactEmail}.`,
        );
        return;
      }
      this.logger.warn(
        `Vendor for run ${runId} has no contact email — falling back to the simulated vendor.`,
      );
    }
    await this.simulatedVendorService.respondToOffer(tenantId, runId, offer, approvalId);
  }

  private async loadVendor(tenantId: string, runId: string): Promise<Vendor | null> {
    try {
      const run = await this.dataSource
        .getRepository(AgentRun)
        .findOne({ where: { id: runId, tenantId } });
      if (!run?.relatedVendorId) return null;
      return this.dataSource
        .getRepository(Vendor)
        .findOne({ where: { id: run.relatedVendorId, tenantId } });
    } catch (err) {
      this.logger.warn(`Failed to load vendor for run ${runId}: ${(err as Error).message}`);
      return null;
    }
  }
}
