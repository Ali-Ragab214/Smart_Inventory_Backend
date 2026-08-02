import { BaseNotificationEvent } from './base-notification.event';

export interface PoReceivedPayload extends Record<string, unknown> {
  purchaseOrderId: string;
  warehouseId: string;
  vendorId?: string;
  status: string;
  lineItemCount: number;
  receivedAt: string;
}

export class PoReceivedEvent extends BaseNotificationEvent<PoReceivedPayload> {}
