import { ReorderDecisionSchema, NegotiationDecisionSchema } from './agent-ai.schemas';

describe('agent-ai.schemas', () => {
  describe('ReorderDecisionSchema', () => {
    it('parses a valid reorder decision', () => {
      const parsed = ReorderDecisionSchema.parse({
        reasoning: 'Stock below threshold',
        confidenceScore: 85,
        paymentTerms: 'Net 30',
        items: [{ skuId: 'sku-1', recommendedQuantity: 10, unitPrice: 5.5 }],
      });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.confidenceScore).toBe(85);
    });

    it('defaults missing optional fields', () => {
      const parsed = ReorderDecisionSchema.parse({});
      expect(parsed.items).toEqual([]);
      expect(parsed.confidenceScore).toBe(0);
      expect(parsed.reasoning).toBe('');
    });

    it('rejects out-of-range confidence', () => {
      expect(() =>
        ReorderDecisionSchema.parse({ confidenceScore: 150 }),
      ).toThrow();
    });
  });

  describe('NegotiationDecisionSchema', () => {
    it('parses a counter action', () => {
      const parsed = NegotiationDecisionSchema.parse({
        action: 'counter',
        requestedDiscountPercent: 12,
      });
      expect(parsed.action).toBe('counter');
      expect(parsed.requestedDiscountPercent).toBe(12);
    });

    it('defaults action to propose', () => {
      const parsed = NegotiationDecisionSchema.parse({});
      expect(parsed.action).toBe('propose');
    });
  });
});