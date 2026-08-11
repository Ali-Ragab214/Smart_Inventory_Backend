import { z } from 'zod';

export const ReorderItemSchema = z.object({
  skuId: z.coerce.string().optional(),
  sku: z.string().optional(),
  productName: z.string().optional(),
  warehouse: z.string().optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  unitPrice: z.number().optional(),
  currentQuantity: z.number().optional(),
  reorderThreshold: z.number().optional(),
  recommendedQuantity: z.number().optional(),
  lineTotal: z.number().optional(),
});

export const ReorderDecisionSchema = z.object({
  reasoning: z.string().default(''),
  confidenceScore: z.number().min(0).max(100).default(0),
  paymentTerms: z.string().default(''),
  items: z.array(ReorderItemSchema).default([]),
});

export type ReorderDecision = z.infer<typeof ReorderDecisionSchema>;

export const NegotiationDecisionSchema = z.object({
  action: z.enum(['propose', 'accept', 'counter', 'escalate']).default('propose'),
  subject: z.string().default(''),
  emailContent: z.string().default(''),
  requestedDiscountPercent: z.number().min(0).max(100).default(0),
  confidenceScore: z.number().min(0).max(100).default(0),
  reasoning: z.string().default(''),
});

export type NegotiationDecision = z.infer<typeof NegotiationDecisionSchema>;

export const ForecastDecisionSchema = z.object({
  projectedDemand: z.number().default(0),
  confidenceScore: z.number().min(0).max(100).default(0),
  period: z.string().default('next-30-days'),
  reasoning: z.string().default(''),
  influencedByCampaigns: z.boolean().default(false),
});

export type ForecastDecision = z.infer<typeof ForecastDecisionSchema>;

export const AgentDecisionSchemas = {
  reorder: ReorderDecisionSchema,
  negotiation: NegotiationDecisionSchema,
  forecasting: ForecastDecisionSchema,
} as const;