import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorNegotiationProfile } from './entities/vendor-negotiation-profile.entity';
import { AgentRun } from './entities/agent-run.entity';
import { AgentEvents, VendorRespondedEvent } from './agent-events';

const DEFAULT_ACCEPT_MIN = 8;
const DEFAULT_COUNTER_STEP = 2;
const DEFAULT_MAX_DISCOUNT = 10;

/**
 * Config-driven simulated vendor. No randomness: behavior is fully determined
 * by the vendor's negotiation profile (or safe defaults when absent).
 *
 * acceptMinimumDiscountPercent ~ threshold below which the vendor counters,
 * counterIncrementPercent ~ how many percentage points it moves per round,
 * maxDiscountPercent        ~ hard ceiling the vendor will never cross.
 */
@Injectable()
export class SimulatedVendorService {
  constructor(
    @InjectRepository(VendorNegotiationProfile)
    private readonly profileRepo: Repository<VendorNegotiationProfile>,
    @InjectRepository(AgentRun)
    private readonly runRepo: Repository<AgentRun>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async respondToOffer(
    tenantId: string,
    negotiationRunId: string,
    offeredDiscountPercent: number,
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

    const profile = await this.getProfile(run);
    const offered = Math.max(0, Number(offeredDiscountPercent) || 0);

    const acceptFloor = profile.hardNegotiates
      ? profile.acceptMinimumDiscountPercent * 1.25
      : profile.acceptMinimumDiscountPercent;
    const step = profile.hardNegotiates
      ? Math.max(1, profile.counterIncrementPercent * 0.5)
      : profile.counterIncrementPercent;

    let accepted: boolean;
    let counter: number | null;
    let message: string;

    if (offered >= acceptFloor) {
      accepted = true;
      counter = null;
      message = `We accept the requested ${offered}% discount.`;
    } else if (offered + step >= profile.maxDiscountPercent) {
      accepted = false;
      counter = null;
      message = `We can go no lower than ${offered}% discount — this is our final position.`;
    } else {
      accepted = false;
      counter = Math.round((offered + step) * 100) / 100;
      message = `We can offer ${counter}% discount instead.`;
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
      accepted,
      counterDiscountPercent: counter,
      message,
    };

    this.eventEmitter.emit(AgentEvents.VENDOR_RESPONDED, event);
    return event;
  }

  private async getProfile(run: AgentRun): Promise<VendorNegotiationProfile> {
    let profile: VendorNegotiationProfile | null = null;
    try {
      profile = await this.profileRepo.findOne({
        where: { vendorId: run.relatedVendorId! },
      });
    } catch {
      profile = null;
    }
    if (profile) return profile;

    const defaults = new VendorNegotiationProfile();
    defaults.vendorId = run.relatedVendorId!;
    defaults.acceptMinimumDiscountPercent = DEFAULT_ACCEPT_MIN;
    defaults.counterIncrementPercent = DEFAULT_COUNTER_STEP;
    defaults.maxDiscountPercent = DEFAULT_MAX_DISCOUNT;
    defaults.hardNegotiates = false;
    return defaults;
  }
}