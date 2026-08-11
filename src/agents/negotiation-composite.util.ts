/**
 * Composite-value negotiation model — deterministic parameters, not prose.
 *
 * A deal is valued on three axes, all measured in USD against the order value
 * (or percentage points of it from the seller's perspective):
 *
 *  1. discount        — the requested discount percent
 *  2. payment terms   — longer net terms give the buyer float value
 *  3. shipping        — shipping cost the buyer pays; lower is better (0 = vendor pays)
 */
export const COMPOSITE_PARAMS = {
  /** Annual cost of capital used to value payment-term float. */
  costOfCapitalAnnual: 0.1,
  /** Industry-standard terms; float value only accrues above this. */
  baselineTermsDays: 30,
  /** Baseline logistics cost the buyer absorbs. */
  standardShippingCost: 50,
  /** Seller cash-flow penalty in percentage points per day over baseline terms. */
  termsPointsPerDay: 0.1,
  /** Max percentage points a seller concedes on shipping (per order value). */
  shippingPointsCap: 5,
  maxTermsDays: 120,
  maxShippingCost: 100,
  maxDiscountPercent: 50,
} as const;

export interface NegotiationOffer {
  discountPercent: number;
  paymentTermsDays?: number;
  shippingCost?: number;
}

export interface CompositeBreakdown {
  orderValue: number;
  discountValueUSD: number;
  floatValueUSD: number;
  shippingSavingsUSD: number;
  compositeValueUSD: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Terms in days, clamped to a sane range, defaulting to baseline net-30. */
export function paymentTermsOf(offer: NegotiationOffer): number {
  const days = Number(offer.paymentTermsDays);
  return Number.isFinite(days) && days > 0
    ? clamp(Math.round(days), 1, COMPOSITE_PARAMS.maxTermsDays)
    : COMPOSITE_PARAMS.baselineTermsDays;
}

/** Buyer-paid shipping cost, clamped, defaulting to the standard $50. */
export function shippingCostOf(offer: NegotiationOffer): number {
  const cost = Number(offer.shippingCost);
  return Number.isFinite(cost) && cost >= 0
    ? clamp(cost, 0, COMPOSITE_PARAMS.maxShippingCost)
    : COMPOSITE_PARAMS.standardShippingCost;
}

/** Order value from negotiation line items (qty x unit price). */
export function computeOrderValueFromItems(
  items: Array<Record<string, unknown>> | null | undefined,
): number {
  return (items ?? []).reduce((sum, item) => {
    const qty = Number(item.recommendedQuantity ?? item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
}

/**
 * Buyer-side value of a proposal in USD:
 * discount savings + payment-term float + shipping savings.
 */
export function computeCompositeValue(
  offer: NegotiationOffer,
  orderValue: number,
): CompositeBreakdown {
  const value = Math.max(0, Number(orderValue) || 0);
  const discount = clamp(
    Number(offer.discountPercent) || 0,
    0,
    COMPOSITE_PARAMS.maxDiscountPercent,
  );
  const termsDays = paymentTermsOf(offer);
  const shipping = shippingCostOf(offer);

  const discountValueUSD = round2((value * discount) / 100);
  const floatValueUSD = round2(
    (value *
      COMPOSITE_PARAMS.costOfCapitalAnnual *
      Math.max(0, termsDays - COMPOSITE_PARAMS.baselineTermsDays)) /
      365,
  );
  const shippingSavingsUSD = round2(
    Math.max(0, COMPOSITE_PARAMS.standardShippingCost - shipping),
  );

  return {
    orderValue: round2(value),
    discountValueUSD,
    floatValueUSD,
    shippingSavingsUSD,
    compositeValueUSD: round2(discountValueUSD + floatValueUSD + shippingSavingsUSD),
  };
}

/**
 * Seller-side measure of the total concession a proposal demands,
 * in percentage points of order value (discount + terms + shipping).
 */
export function computeVendorConcessionPts(
  offer: NegotiationOffer,
  orderValue: number,
): number {
  const discount = clamp(
    Number(offer.discountPercent) || 0,
    0,
    COMPOSITE_PARAMS.maxDiscountPercent,
  );
  const termsDays = paymentTermsOf(offer);
  const shipping = shippingCostOf(offer);
  const value = Math.max(0, Number(orderValue) || 0);

  const termsPts =
    Math.max(0, termsDays - COMPOSITE_PARAMS.baselineTermsDays) *
    COMPOSITE_PARAMS.termsPointsPerDay;
  const shippingPts =
    value > 0
      ? Math.min(
          COMPOSITE_PARAMS.shippingPointsCap,
          (Math.max(0, COMPOSITE_PARAMS.standardShippingCost - shipping) / value) * 100,
        )
      : 0;

  return round2(discount + termsPts + shippingPts);
}