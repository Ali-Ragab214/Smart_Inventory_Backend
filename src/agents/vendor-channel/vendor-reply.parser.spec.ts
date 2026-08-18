import { Test, TestingModule } from '@nestjs/testing';
import { GatewayLlmService } from '../gateway-llm.service';
import { VendorReplyParser } from './vendor-reply.parser';
import { extractAddress, extractRunId, sameAddress } from './vendor-inbound-mail.service';

describe('VendorReplyParser', () => {
  let service: VendorReplyParser;
  let chat: jest.Mock;

  beforeEach(async () => {
    chat = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorReplyParser,
        { provide: GatewayLlmService, useValue: { chat } },
      ],
    }).compile();
    service = module.get<VendorReplyParser>(VendorReplyParser);
  });

  describe('stripQuotedText', () => {
    it('cuts quoted replies at the original-message marker', () => {
      const body =
        'We can do 5% discount.\n\n-----Original Message-----\nFrom: stocksavvy@gmail.com\nSubject: offer';
      expect(service.stripQuotedText(body)).toContain('5%');
      expect(service.stripQuotedText(body)).not.toContain('Original Message');
    });

    it('drops quoted > lines', () => {
      const body = 'Ok, deal.\n> We are requesting 10% off\n> please confirm';
      expect(service.stripQuotedText(body)).toBe('Ok, deal.');
    });
  });

  describe('heuristic parsing (LLM fails)', () => {
    it('accepts on "we accept"', async () => {
      chat.mockRejectedValue(new Error('llm down'));
      const reply = await service.parseReply('Hi, we accept your offer. Thanks!');
      expect(reply.accepted).toBe(true);
      expect(reply.counterDiscountPercent).toBeNull();
    });

    it('parses a counter discount', async () => {
      chat.mockRejectedValue(new Error('llm down'));
      const reply = await service.parseReply('Sorry, but we can only offer 4% discount.');
      expect(reply.accepted).toBe(false);
      expect(reply.counterDiscountPercent).toBe(4);
    });

    it('detects a firm rejection with no counter', async () => {
      chat.mockRejectedValue(new Error('llm down'));
      const reply = await service.parseReply('This is our final position, we cannot go lower.');
      expect(reply.accepted).toBe(false);
      expect(reply.counterDiscountPercent).toBeNull();
    });

    it('extracts payment terms and shipping', async () => {
      chat.mockRejectedValue(new Error('llm down'));
      const reply = await service.parseReply('5% only, at net-60 terms, with $40 shipping.');
      expect(reply.paymentTermsDays).toBe(60);
      expect(reply.shippingCost).toBe(40);
    });
  });

  describe('LLM parsing', () => {
    it('uses structured LLM output when available', async () => {
      chat.mockResolvedValue(
        '{"accepted": true, "counterDiscountPercent": null, "paymentTermsDays": null, "shippingCost": null, "message": "accepted"}',
      );
      const reply = await service.parseReply('we accept');
      expect(reply.accepted).toBe(true);
    });

    it('falls back to heuristics when LLM returns garbage', async () => {
      chat.mockResolvedValue('sorry, not a json');
      const reply = await service.parseReply('ok deal');
      expect(reply.accepted).toBe(true);
    });
  });
});

describe('vendor-inbound correlation helpers', () => {
  it('extracts a run id from a tagged subject', () => {
    const id = '1cc4c028-c300-41e5-aa31-5a2ceb3697b8';
    expect(extractRunId(`Re: [StockSavvy NEG-${id}] Discount request`)).toBe(id);
    expect(extractRunId('no tag here')).toBeNull();
  });

  it('normalizes addresses for comparison', () => {
    expect(sameAddress('Sales <sales@acme.com>', 'SALES@acme.com')).toBe(true);
    expect(extractAddress({ value: [{ address: 'a@b.com' }] })).toBe('a@b.com');
  });
});
