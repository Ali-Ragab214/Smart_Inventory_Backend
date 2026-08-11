export const NotificationEvents = {
  APPROVAL_REQUESTED: 'approval.requested',
  LOW_STOCK_DETECTED: 'lowstock.detected',
  PO_RECEIVED: 'po.received',
  VENDOR_RESPONDED: 'vendor.responded',
} as const;

export const NOTIFICATION_SOCKET_EVENT = 'notification:created';

export type NotificationEventName =
  (typeof NotificationEvents)[keyof typeof NotificationEvents];
