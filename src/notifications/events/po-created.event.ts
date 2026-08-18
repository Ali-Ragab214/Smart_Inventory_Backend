import { BaseNotificationEvent } from './base-notification.event';

export interface PoCreatedPayload extends Record<string, unknown> {
  purchaseOrderId: string;
  warehouseId: string;
  vendorId?: string;
  status: string;
  lineItemCount: number;
  createdAt: string;
}

export class PoCreatedEvent extends BaseNotificationEvent<PoCreatedPayload> {}
