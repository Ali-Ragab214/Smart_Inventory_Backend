import { Injectable, Logger } from '@nestjs/common';
import { GatewayLlmService } from '../gateway-llm.service';
import { VendorReply } from './vendor-channel.types';
import { VendorReplySchema } from './vendor-reply.schema';

const QUOTE_MARKERS: Array<string | RegExp> = [
  '-----Original Message-----',
  '________________________________',
  /^From: .* (?:sent|Sent).*$/m,
  /On \w+ \d{1,2}, \d{4}.*wrote:\s*$/m,
  /^—{2,}$/m,
];

/**
 * Converts a vendor's natural-language email reply into the structured
 * VendorReply the negotiation state machine consumes. Uses the gateway LLM
 * with a deterministic heuristic fallback so the loop never deadlocks on a
 * failed model call.
 */
@Injectable()
export class VendorReplyParser {
  private readonly logger = new Logger(VendorReplyParser.name);

  constructor(private readonly llm: GatewayLlmService) {}

  /** Cut the quoted original from a reply body, keeping only the newest text. */
  stripQuotedText(body: string): string {
    let text = body ?? '';
    for (const marker of QUOTE_MARKERS) {
      const idx =
        typeof marker === 'string' ? text.indexOf(marker) : text.search(marker);
      if (idx > 0) {
        text = text.slice(0, idx);
      }
    }
    const unquoted = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('>'))
      .join('\n')
      .trim();
    return unquoted.length > 0 ? unquoted : text.trim();
  }

  async parseReply(rawBody: string): Promise<VendorReply> {
    const body = this.stripQuotedText(rawBody);
    if (!body) {
      return {
        accepted: false,
        counterDiscountPercent: null,
        paymentTermsDays: null,
        shippingCost: null,
        message: '',
      };
    }
    try {
      const llmReply = await this.parseWithLlm(body);
      if (llmReply) return llmReply;
    } catch (err) {
      this.logger.warn(`LLM reply parse failed, using heuristics: ${(err as Error).message}`);
    }
    return this.heuristicParse(body);
  }

  private async parseWithLlm(body: string): Promise<VendorReply | null> {
    const systemPrompt =
      'You parse a buyer/vendor purchase negotiation email reply into a strict JSON object. ' +
      'Only the vendor\'s intent matters. Respond with ONLY valid JSON, no markdown fences, no other text: ' +
      '{"accepted": boolean, "counterDiscountPercent": number|null, "paymentTermsDays": number|null, "shippingCost": number|null, "message": string}. ' +
      'accepted=true only if the vendor clearly accepts the offer. If the vendor counters, set counterDiscountPercent to the percentage they offer and accepted=false. ' +
      'If the vendor refuses with no counter, leave counterDiscountPercent null and accepted=false. ' +
      'Extract payment terms (net days) and shipping cost in USD if mentioned, otherwise null. message is a short summary of the reply.';

    const raw = await this.llm.chat(systemPrompt, `Vendor reply:\n${body}`);
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    try {
      const parsed = VendorReplySchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
      if (parsed.success) return parsed.data;
      return null;
    } catch {
      return null;
    }
  }

  private heuristicParse(body: string): VendorReply {
    const lower = body.toLowerCase();
    const acceptRx =
      /\b(accept|accepted|agree|agreed|okay|ok\b|deal|approved|confirmed|yes|sounds good|works for us|happy to)\b/;
    const rejectRx =
      /\b(reject|rejected|decline|declined|cannot|can'?t|can not|not possible|final position|no lower|we can'?t|unfortunately|unable to)\b/;

    const pctMatch = lower.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    const termsMatch =
      lower.match(/net[-\s]?(\d{1,3})/) ||
      lower.match(/(\d{1,3})\s*(?:days?|day)\b/);
    const shippingMatch =
      lower.match(/\$\s?(\d{1,3}(?:\.\d+)?)\s*shipping/i) ||
      lower.match(/shipping[^\d$]{0,24}\$\s?(\d{1,3}(?:\.\d+)?)/i);

    const accepted = acceptRx.test(lower) && !rejectRx.test(lower);
    const counter = pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : null;

    return {
      accepted,
      counterDiscountPercent: accepted ? null : counter,
      paymentTermsDays: termsMatch
        ? Math.min(120, Math.max(1, Number(termsMatch[1])))
        : null,
      shippingCost: shippingMatch
        ? Math.min(100, Math.max(0, Number(shippingMatch[1])))
        : null,
      message: body.slice(0, 500),
    };
  }
}
