import { BaseNotificationEvent } from './base-notification.event';

export interface ApprovalRequestedPayload extends Record<string, unknown> {
  approvalId: string;
  agentRunId: string;
  agentType: string;
  stepNumber: number;
  reasoning?: string | null;
  requestedAt: string;
}

export class ApprovalRequestedEvent extends BaseNotificationEvent<ApprovalRequestedPayload> {}
