import { BaseNotificationEvent } from './base-notification.event';

export interface VendorRespondedPayload extends Record<string, unknown> {
  vendorId: string;
  skuId: string;
  catalogEntryId: string;
  price?: number;
  leadTimeDays?: number;
  respondedAt: string;
}

export class VendorRespondedEvent extends BaseNotificationEvent<VendorRespondedPayload> {}
