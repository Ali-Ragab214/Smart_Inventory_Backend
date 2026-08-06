import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentRunService } from './agent-run.service';
import { NotificationEvents } from '../notifications/events/notification-events';
import { LowStockDetectedEvent } from '../notifications/events/low-stock-detected.event';

@Injectable()
export class AgentSchedulerService {
  private readonly logger = new Logger(AgentSchedulerService.name);

  constructor(private readonly agentRunService: AgentRunService) {}

  @OnEvent(NotificationEvents.LOW_STOCK_DETECTED, { async: true })
  async handleLowStockDetected(event: LowStockDetectedEvent) {
    this.logger.log(`[Organic Trigger] Low stock detected for SKU ${event.payload.skuId}. Waking up Agents...`);
    try {
      // Trigger Reorder Agent
      const reorderResult = await this.agentRunService.start(event.tenantId, 'reorder', {
        skuIds: [event.payload.skuId],
      });
      const reorderRunId = (reorderResult as any).data?.id ?? (reorderResult as any).id;
      await this.agentRunService.enqueue(event.tenantId, reorderRunId, 'reorder');
      this.logger.log(`[Organic Trigger] Reorder agent queued for runId ${reorderRunId}`);

      // Trigger Negotiation Agent
      const negResult = await this.agentRunService.start(event.tenantId, 'negotiation', {
        skuIds: [event.payload.skuId],
      });
      const negRunId = (negResult as any).data?.id ?? (negResult as any).id;
      await this.agentRunService.enqueue(event.tenantId, negRunId, 'negotiation');
      this.logger.log(`[Organic Trigger] Negotiation agent queued for runId ${negRunId}`);

    } catch (error) {
      this.logger.error(`[Organic Trigger] Failed to trigger agents organically`, error);
    }
  }
}
