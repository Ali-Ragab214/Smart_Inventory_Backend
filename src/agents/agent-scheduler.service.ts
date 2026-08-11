import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AgentRunService } from './agent-run.service';
import { NotificationEvents } from '../notifications/events/notification-events';
import { LowStockDetectedEvent } from '../notifications/events/low-stock-detected.event';
import { PoReceivedEvent } from '../notifications/events/po-received.event';

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

    } catch (error) {
      this.logger.error(`[Organic Trigger] Failed to trigger agents organically`, error);
    }
  }

  @OnEvent(NotificationEvents.PO_RECEIVED, { async: true })
  async handlePoReceived(event: PoReceivedEvent) {
    this.logger.log(`[Organic Trigger] PO ${event.payload.purchaseOrderId} received. Waking up Feedback Agent...`);
    try {
      const result = await this.agentRunService.start(event.tenantId, 'feedback', {
        poId: event.payload.purchaseOrderId,
      });
      const runId = (result as any).data?.id ?? (result as any).id;
      await this.agentRunService.enqueue(event.tenantId, runId, 'feedback');
      this.logger.log(`[Organic Trigger] Feedback agent queued for runId ${runId}`);
    } catch (error) {
      this.logger.error(`[Organic Trigger] Failed to trigger Feedback Agent organically`, error);
    }
  }
}
