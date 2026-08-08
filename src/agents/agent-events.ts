export const AgentEvents = {
  VENDOR_RESPONDED: 'agents.vendor.responded',
} as const;

export interface VendorRespondedEvent {
  tenantId: string;
  offerId: string;
  negotiationRunId: string;
  vendorId: string;
  roundNumber: number;
  offeredDiscountPercent: number;
  accepted: boolean;
  counterDiscountPercent: number | null;
  message: string;
}