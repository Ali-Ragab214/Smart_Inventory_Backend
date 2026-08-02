import { BaseNotificationEvent } from './base-notification.event';

export interface AnomalyFlaggedPayload extends Record<string, unknown> {
  anomalyId: string;
  skuId?: string | null;
  warehouseId?: string | null;
  description: string;
  agentRunId?: string | null;
  flaggedAt: string;
}

export class AnomalyFlaggedEvent extends BaseNotificationEvent<AnomalyFlaggedPayload> {}
