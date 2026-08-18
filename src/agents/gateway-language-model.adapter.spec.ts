import { GatewayLanguageModelAdapter } from './gateway-language-model.adapter';

const config = {
  get: (key: string) => {
    const env: Record<string, string> = {
      AI_API_URL: 'http://gateway.test/api/v1',
      AI_API_KEY: 'test-key',
      AI_MODEL: 'deepseek.v3.2',
    };
    return env[key];
  },
} as any;

describe('gateway-language-model.adapter', () => {
  const adapter = new GatewayLanguageModelAdapter(config);

  describe('serializePrompt', () => {
    it('flattens user and system messages into gateway messages', () => {
      const { messages, systemPrompt } = adapter.serializePrompt([
        { role: 'system', content: [{ type: 'text', text: 'Be concise.' }] },
        { role: 'user', content: 'Restock?' },
      ]);
      expect(systemPrompt).toBe('Be concise.');
      expect(messages).toEqual([{ role: 'user', content: 'Restock?' }]);
    });

    it('flattens prior tool calls and results into readable text', () => {
      const { messages } = adapter.serializePrompt([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Check vendors' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'get_vendors_for_sku',
              input: '{"skuId":"abc"}',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'get_vendors_for_sku',
              output: { type: 'json', value: { price: 5 } },
            },
          ],
        },
      ]);

      const joined = messages.map((m) => m.content).join('|');
      expect(joined).toContain('[tool call get_vendors_for_sku');
      expect(joined).toContain('[tool result get_vendors_for_sku');
      expect(joined).toContain('5');
    });
  });

  describe('parseToolCall', () => {
    it('detects a fenced JSON tool call', () => {
      const call = adapter.parseToolCall(
        '```json\n{"tool":"get_vendors_for_sku","parameters":{"skuId":"abc"}}\n```',
        new Set(['get_vendors_for_sku']),
      );
      expect(call).not.toBeNull();
      expect(call?.toolName).toBe('get_vendors_for_sku');
      expect(JSON.parse(call!.argumentsJson)).toEqual({ skuId: 'abc' });
    });

    it('returns null for plain text', () => {
      expect(adapter.parseToolCall('No tools needed', new Set())).toBeNull();
    });

    it('returns null when the tool is not in the known set', () => {
      expect(
        adapter.parseToolCall(
          '{"tool":"unknown_tool","parameters":{}}',
          new Set(['get_sku']),
        ),
      ).toBeNull();
    });
  });

  describe('generate', () => {
    it('emits a tool-call content part when the model wants a tool', async () => {
      jest.spyOn(adapter, 'complete' as any).mockResolvedValue({
        text: '{"tool":"get_sku","parameters":{"skuId":"abc"}}',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });

      const result = await adapter.generate({
        prompt: [{ role: 'user', content: 'check sku' }],
        tools: [{ name: 'get_sku', description: 'x', inputSchema: {} }],
      });

      expect(result.finishReason).toBe('tool-calls');
      expect((result.content[0] as any).type).toBe('tool-call');
      expect((result.content[0] as any).toolName).toBe('get_sku');
    });

    it('emits a text content part for final answers', async () => {
      jest.spyOn(adapter, 'complete' as any).mockResolvedValue({
        text: 'All good.',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });

      const result = await adapter.generate({
        prompt: [{ role: 'user', content: 'check sku' }],
      });

      expect(result.finishReason).toBe('stop');
      expect(result.content).toEqual([{ type: 'text', text: 'All good.' }]);
    });
  });
});