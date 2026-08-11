import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { VendorNegotiationProfile } from './entities/vendor-negotiation-profile.entity';
import { AgentRun } from './entities/agent-run.entity';
import { AgentEvents, VendorRespondedEvent } from './agent-events';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { Vendor, VendorTier } from '../vendors/entities/vendor.entity';
import {
  NegotiationOffer,
  computeCompositeValue,
  computeOrderValueFromItems,
  computeVendorConcessionPts,
  paymentTermsOf,
  shippingCostOf,
} from './negotiation-composite.util';

const DEFAULT_ACCEPT_MIN = 8;
const DEFAULT_COUNTER_STEP = 2;
const DEFAULT_MAX_DISCOUNT = 10;

/** Tier 1 pricing only applies to bulk orders — enforced here as a parameter. */
const BULK_ORDER_MIN_VALUE = 1000;

/** Fallback negotiation parameters when a vendor has no profile row. */
const TIER_DEFAULTS: Record<string, { accept: number; step: number; max: number; hard: boolean }> = {
  tier1: { accept: 6, step: 2, max: 10, hard: false },
  tier2: { accept: DEFAULT_ACCEPT_MIN, step: DEFAULT_COUNTER_STEP, max: DEFAULT_MAX_DISCOUNT, hard: false },
  tier3: { accept: 9, step: 1, max: 7, hard: true },
};

/**
 * Config-driven simulated vendor. No randomness: behavior is fully determined
 * by the vendor's negotiation profile (or tier defaults when absent).
 *
 * acceptMinimumDiscountPercent ~ total concession floor (percentage points of
 * the order value) below which the vendor counters,
 * counterIncrementPercent ~ how many percentage points it moves per round,
 * maxDiscountPercent        ~ hard ceiling the vendor will never cross.
 *
 * Composite-value model: the vendor weighs the concession a proposal demands
 * (discount + payment-term float + shipping) rather than discount alone.
 */
@Injectable()
export class SimulatedVendorService {
  constructor(
    @InjectRepository(VendorNegotiationProfile)
    private readonly profileRepo: Repository<VendorNegotiationProfile>,
    @InjectRepository(AgentRun)
    private readonly runRepo: Repository<AgentRun>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  async respondToOffer(
    tenantId: string,
    negotiationRunId: string,
    offer: NegotiationOffer,
    offerId = negotiationRunId,
  ): Promise<VendorRespondedEvent> {
    const run = await this.runRepo.findOne({
      where: { id: negotiationRunId, tenantId },
    });
    if (!run) {
      throw new NotFoundException({ message: 'The negotiation agent run could not be found.', code: 'AGENT_RUN_NOT_FOUND' });
    }
    if (!run.relatedVendorId) {
      throw new NotFoundException({ message: 'The negotiation run has no vendor to respond to.', code: 'NEGOTIATION_VENDOR_MISSING' });
    }

    const tier = await this.getVendorTier(tenantId, run.relatedVendorId);
    const orderValue = await this.computeOrderValue(tenantId, run);
    const offered = Math.max(0, Number(offer.discountPercent) || 0);
    const termsDays = paymentTermsOf(offer);
    const shipping = shippingCostOf(offer);
    const composite = computeCompositeValue({ discountPercent: offered, paymentTermsDays: termsDays, shippingCost: shipping }, orderValue);
    const concessionPts = computeVendorConcessionPts({ discountPercent: offered, paymentTermsDays: termsDays, shippingCost: shipping }, orderValue);

    // Tier 1 bulk-only rule: no discount path at all unless this is a bulk order.
    if (tier === VendorTier.TIER_1 && !(await this.isBulkEligible(tenantId, run))) {
      run.status = 'awaiting_vendor_response';
      await this.runRepo.save(run);
      const event: VendorRespondedEvent = {
        tenantId,
        offerId,
        negotiationRunId: run.id,
        vendorId: run.relatedVendorId,
        roundNumber: run.roundNumber,
        offeredDiscountPercent: offered,
        paymentTermsDays: termsDays,
        shippingCost: shipping,
        orderValue: composite.orderValue,
        compositeValueUSD: composite.compositeValueUSD,
        concessionPts,
        accepted: false,
        counterDiscountPercent: null,
        counterPaymentTermsDays: null,
        counterShippingCost: null,
        message:
          'Tier 1 pricing applies to bulk orders only (minimum order value $1,000). Please consolidate the order to qualify.',
      };
      this.eventEmitter.emit(AgentEvents.VENDOR_RESPONDED, event);
      return event;
    }

    const profile = await this.getProfile(run, tier);

    const acceptFloor = profile.hardNegotiates
      ? profile.acceptMinimumDiscountPercent * 1.25
      : profile.acceptMinimumDiscountPercent;
    const step = profile.hardNegotiates
      ? Math.max(1, profile.counterIncrementPercent * 0.5)
      : profile.counterIncrementPercent;

    let accepted: boolean;
    let counter: number | null;
    let counterTerms: number | null = null;
    let counterShipping: number | null = null;
    let message: string;

    if (concessionPts >= acceptFloor) {
      accepted = true;
      counter = null;
      message = `We accept the proposed package: ${offered}% discount, net-${termsDays} terms, $${shipping} shipping.`;
    } else if (offered + step >= profile.maxDiscountPercent) {
      accepted = false;
      counter = null;
      message = `We can go no lower than ${offered}% discount — this is our final position.`;
    } else {
      accepted = false;
      counter = Math.round((offered + step) * 100) / 100;
      const stances: string[] = [];
      if (termsDays > 30) {
        counterTerms = 30;
        stances.push('at standard net-30 payment terms');
      }
      if (shipping < 50) {
        counterShipping = 50;
        stances.push('with standard $50 shipping');
      }
      message = `We can offer ${counter}% discount${stances.length > 0 ? ' only ' + stances.join(' and ') : ''} instead.`;
    }

    run.status = 'awaiting_vendor_response';
    await this.runRepo.save(run);

    const event: VendorRespondedEvent = {
      tenantId,
      offerId,
      negotiationRunId: run.id,
      vendorId: run.relatedVendorId,
      roundNumber: run.roundNumber,
      offeredDiscountPercent: offered,
      paymentTermsDays: termsDays,
      shippingCost: shipping,
      orderValue: composite.orderValue,
      compositeValueUSD: composite.compositeValueUSD,
      concessionPts,
      accepted,
      counterDiscountPercent: counter,
      counterPaymentTermsDays: counterTerms,
      counterShippingCost: counterShipping,
      message,
    };

    this.eventEmitter.emit(AgentEvents.VENDOR_RESPONDED, event);
    return event;
  }

  /** Order value backing the offer: negotiation line items first, then the PO. */
  private async computeOrderValue(tenantId: string, run: AgentRun): Promise<number> {
    try {
      const fromItems = computeOrderValueFromItems(
        (run.negotiationItems as Array<Record<string, unknown>> | null) ?? undefined,
      );
      if (fromItems > 0) return fromItems;
    } catch {
      /* fall through to PO */
    }
    if (!run.relatedPoId) return 0;
    try {
      const po = await this.dataSource
        .getRepository(PurchaseOrder)
        .findOne({ where: { id: run.relatedPoId, tenantId }, relations: { lineItems: true } });
      if (!po) return 0;
      return computeOrderValueFromItems((po.lineItems ?? []) as unknown as Array<Record<string, unknown>>);
    } catch {
      return 0;
    }
  }

  private async getVendorTier(tenantId: string, vendorId: string): Promise<VendorTier> {
    try {
      const vendor = await this.dataSource
        .getRepository(Vendor)
        .createQueryBuilder('vendor')
        .select('vendor.tier', 'tier')
        .where('vendor.id = :id', { id: vendorId })
        .andWhere('vendor.tenantId = :tenantId', { tenantId })
        .getRawOne<{ tier: VendorTier }>();
      return vendor?.tier ?? VendorTier.TIER_2;
    } catch {
      return VendorTier.TIER_2;
    }
  }

  /** True when the negotiation is tied to a PO whose total value meets the bulk threshold. */
  private async isBulkEligible(tenantId: string, run: AgentRun): Promise<boolean> {
    if (!run.relatedPoId) return false;
    try {
      const po = await this.dataSource
        .getRepository(PurchaseOrder)
        .findOne({ where: { id: run.relatedPoId, tenantId }, relations: { lineItems: true } });
      if (!po) return false;
      const total = (po.lineItems ?? []).reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
        0,
      );
      return total >= BULK_ORDER_MIN_VALUE;
    } catch {
      return false;
    }
  }

  private async getProfile(run: AgentRun, tier: VendorTier): Promise<VendorNegotiationProfile> {
    let profile: VendorNegotiationProfile | null = null;
    try {
      profile = await this.profileRepo.findOne({
        where: { vendorId: run.relatedVendorId! },
      });
    } catch {
      profile = null;
    }
    if (profile) return profile;

    const defaults = TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.tier2;
    const fallback = new VendorNegotiationProfile();
    fallback.vendorId = run.relatedVendorId!;
    fallback.acceptMinimumDiscountPercent = defaults.accept;
    fallback.counterIncrementPercent = defaults.step;
    fallback.maxDiscountPercent = defaults.max;
    fallback.hardNegotiates = defaults.hard;
    return fallback;
  }
}