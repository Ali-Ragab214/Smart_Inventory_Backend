import { z } from 'zod';
import { VendorReply } from './vendor-channel.types';

/**
 * Structured schema for LLM-parsed vendor replies. Mirrors the negotiation
 * decision schema pattern used elsewhere in the agents module.
 */
export const VendorReplySchema = z.object({
  accepted: z.boolean(),
  counterDiscountPercent: z.number().min(0).max(100).nullable().default(null),
  paymentTermsDays: z.number().min(1).max(120).nullable().default(null),
  shippingCost: z.number().min(0).max(100).nullable().default(null),
  message: z.string().default(''),
});

export type VendorReplyDto = z.infer<typeof VendorReplySchema>;

export function normalizeReply(parsed: VendorReplyDto): VendorReply {
  return {
    accepted: parsed.accepted,
    counterDiscountPercent: parsed.accepted ? null : parsed.counterDiscountPercent,
    paymentTermsDays: parsed.paymentTermsDays,
    shippingCost: parsed.shippingCost,
    message: parsed.message,
  };
}
