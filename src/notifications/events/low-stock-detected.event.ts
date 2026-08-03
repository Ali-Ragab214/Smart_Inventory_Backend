import { BaseNotificationEvent } from './base-notification.event';

export interface LowStockDetectedPayload extends Record<string, unknown> {
  skuId: string;
  skuName?: string;
  warehouseId: string;
  quantity: number;
  reorderThreshold: number;
  safetyStock?: number;
  detectedAt: string;
}

export class LowStockDetectedEvent extends BaseNotificationEvent<LowStockDetectedPayload> {}
