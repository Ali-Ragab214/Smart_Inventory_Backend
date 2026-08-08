import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentEvents, VendorRespondedEvent } from './agent-events';
import { ApprovalQueueService } from './approval-queue.service';
import { AgentRunService, AgentType } from './agent-run.service';

/**
 * Multi-round negotiation state machine.
 *
 * VENDOR_RESPONDED transitions:
 * - accepted        -> step-2 "Counter-Offer Review / Final Sign-Off" approval
 * - counter         -> bump round, re-enqueue the Mastra negotiation agent to
 *                       draft a counter proposal (loop)
 * - counter >= cap  -> escalation step-2 approval (human final sign-off)
 */
@Injectable()
export class NegotiationStateMachineService {
  private readonly logger = new Logger(NegotiationStateMachineService.name);

  constructor(
    private readonly approvalQueueService: ApprovalQueueService,
    private readonly agentRunService: AgentRunService,
  ) {}

  @OnEvent(AgentEvents.VENDOR_RESPONDED, { async: true })
  async onVendorResponded(event: VendorRespondedEvent): Promise<void> {
    const { tenantId, offerId } = event;
    try {
      const runId = event.negotiationRunId;
      const runRecord = await this.agentRunService.load(tenantId, runId);
      const run = (runRecord.data as any)?.run ?? null;
      const roundNumber: number = run?.roundNumber ?? event.roundNumber;
      const maxRounds: number = run?.maxRounds ?? 3;

      if (event.accepted) {
        await this.approvalQueueService.create(tenantId, {
          agentRunId: runId,
          agentType: 'negotiation',
          stepNumber: 2,
          payload: {
            vendorId: event.vendorId,
            verdict: 'accepted',
            finalDiscountPercent: event.offeredDiscountPercent,
            vendorMessage: event.message,
            roundNumber,
          },
          reasoning: `Simulated vendor accepted the ${event.offeredDiscountPercent}% discount request.`,
        });
        await this.agentRunService.updateStatus(tenantId, runId, 'awaiting_approval');
        this.logger.log(`Vendor accepted ${event.offeredDiscountPercent}% — step 2 review for run ${runId}`);
        return;
      }

      const move = event.counterDiscountPercent ?? event.offeredDiscountPercent;
      if (roundNumber >= maxRounds) {
        await this.approvalQueueService.create(tenantId, {
          agentRunId: runId,
          agentType: 'negotiation',
          stepNumber: 2,
          payload: {
            vendorId: event.vendorId,
            verdict: 'escalated',
            final: move,
            vendorMessage: event.message,
            roundNumber,
          },
          reasoning: `Reached ${maxRounds} negotiation round(s); escalated for human final sign-off.`,
        });
        await this.agentRunService.updateStatus(tenantId, runId, 'escalated');
        this.logger.log(`Escalated negotiation run ${runId} after ${roundNumber} round(s).`);
        return;
      }

      const nextRound = roundNumber + 1;
      await this.agentRunService.advanceRound(tenantId, runId);
      await this.agentRunService.enqueue(tenantId, runId, 'negotiation', {
        draftType: 'counter',
        counterDiscountPercent: move,
        vendorReply: event.message,
        roundNumber: nextRound,
      });
      await this.agentRunService.updateStatus(tenantId, runId, 'in_progress');
      this.logger.log(`Vendor countered ${move}% — round ${nextRound} draft for run ${runId}`);
    } catch (error) {
      this.logger.error(
        `Negotiation state machine failed for offer ${event.offerId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}

export type NegotiationAgentType = Extract<AgentType, 'negotiation'>;