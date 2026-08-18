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
  paymentTermsDays: number;
  shippingCost: number;
  orderValue: number;
  compositeValueUSD: number;
  concessionPts: number;
  accepted: boolean;
  counterDiscountPercent: number | null;
  counterPaymentTermsDays: number | null;
  counterShippingCost: number | null;
  message: string;
}