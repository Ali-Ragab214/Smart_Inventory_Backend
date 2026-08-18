import { NegotiationOffer } from '../negotiation-composite.util';

export type VendorChannelName = 'simulated' | 'email';

/** Tag embedded in the outbound subject so replies can be correlated to a run. */
export const NEG_TAG_PREFIX = '[StockSavvy NEG-';

export interface VendorOfferPayload {
  tenantId: string;
  runId: string;
  approvalId: string;
  vendorId: string;
  /** Recipient address (vendor.contactEmail). */
  to: string;
  subject: string;
  text: string;
  offer: NegotiationOffer;
}

/** Structured vendor reply parsed from a real email. */
export interface VendorReply {
  accepted: boolean;
  counterDiscountPercent: number | null;
  paymentTermsDays: number | null;
  shippingCost: number | null;
  message: string;
}
