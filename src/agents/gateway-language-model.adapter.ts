import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { LanguageModelV2, LanguageModelV2CallOptions } from '@ai-sdk/provider';

export type GatewayUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type InternalToolCall = {
  toolCallId: string;
  toolName: string;
  argumentsJson: string;
};

type ProviderToolConfig = {
  type?: 'function' | 'provider-defined';
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  id?: string;
  args?: Record<string, unknown>;
};

type PromptMessage = {
  role: string;
  content?: unknown;
};

type StreamPart = Record<string, unknown>;

type GatewayPayload = {
  model_id: string;
  messages: Array<{ role: string; content: string }>;
  system_prompt: string;
  tools: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  temperature: number;
};

/**
 * Wraps the ITI LLM gateway (`AI_API_URL/student/chat`) behind the AI SDK v2
 * language model interface so Mastra agents can use it end to end.
 *
 * The gateway has no native tool-calling protocol: when tools are supplied it
 * returns the selected tool as a plain JSON object embedded in `output_text`
 * (often fenced), e.g.:
 * ```json
 * {"tool":"get_weather","parameters":{"location":"cairo"}}
 * ```
 * `doGenerate` translates those replies into real `tool-call` content parts so
 * the Mastra loop executes the tools and feeds results back.
 *
 * The gateway does not stream; `doStream` performs the same single round trip
 * and replays the answer as text deltas.
 */
export class GatewayLanguageModelAdapter {
  private readonly logger = new Logger('GatewayLanguageModel');
  readonly specificationVersion = 'v2' as const;
  readonly provider = 'iti-gateway';
  readonly modelId: string;
  readonly supportedUrls: PromiseLike<Record<string, RegExp[]>> = Promise.resolve({});

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: Pick<ConfigService, 'get'>) {
    this.baseUrl = (
      config.get<string>('AI_API_URL') ||
      'http://apiaccess.iti.net.eg/api/v1'
    ).replace(/\/+$/, '');
    this.apiKey =
      config.get<string>('AI_API_KEY') ||
      config.get<string>('ANTHROPIC_API_KEY') ||
      '';
    this.modelId = config.get<string>('AI_MODEL') || 'deepseek.v3.2';
  }

  /**
   * Collapse an AI SDK v2 prompt into the gateway's plain `{role, content}`
   * list plus a concatenated system prompt. Tool calls/results of previous
   * turns are flattened to readable text.
   */
  serializePrompt(prompt: unknown): {
    messages: Array<{ role: string; content: string }>;
    systemPrompt: string;
  } {
    const messages: Array<{ role: string; content: string }> = [];
    const systemParts: string[] = [];
    const list = prompt as PromptMessage[];

    for (const message of list ?? []) {
      const parts = Array.isArray(message.content)
        ? message.content
        : typeof message.content === 'string'
          ? [{ type: 'text', text: message.content }]
          : [];

      const rendered = (parts as Array<Record<string, unknown>>)
        .map((part) => {
          switch (part.type) {
            case 'tool-call': {
              const p = part as { toolName?: string; input?: string; arguments?: string };
              return `[tool call ${p.toolName ?? 'tool'}(${p.input ?? p.arguments ?? '{}'})]`;
            }
            case 'tool-result': {
              const p = part as { toolName?: string; output?: { type?: string; value?: unknown } };
              const value =
                p.output && typeof p.output === 'object' && 'value' in p.output
                  ? p.output.value
                  : '';
              return `[tool result ${p.toolName ?? 'tool'}: ${JSON.stringify(value)}]`;
            }
            default:
              return typeof part.text === 'string' ? part.text : '';
          }
        })
        .filter((s) => s.length > 0)
        .join('\n');

      if (message.role === 'system') {
        systemParts.push(rendered);
      } else if (message.role === 'tool') {
        messages.push({ role: 'user', content: rendered });
      } else {
        messages.push({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: rendered,
        });
      }
    }

    return { messages, systemPrompt: systemParts.join('\n') };
  }

  /**
   * Parse a raw gateway reply. Returns a tool call when the reply is a JSON
   * object naming a known tool, otherwise null (plain text).
   */
  parseToolCall(outputText: string, knownTools?: Set<string>): InternalToolCall | null {
    const candidate = outputText
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```\s*$/g, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    const toolName = obj.tool ?? obj.toolName ?? obj.name;
    if (typeof toolName !== 'string' || toolName.length === 0) return null;
    if (knownTools && !knownTools.has(toolName)) return null;

    const parameters = obj.parameters ?? obj.arguments ?? {};
    return {
      toolCallId: randomUUID(),
      toolName,
      argumentsJson:
        typeof parameters === 'string' ? parameters : JSON.stringify(parameters),
    };
  }

  private buildPayload(
    prompt: unknown,
    tools?: unknown,
    temperature?: number,
  ): GatewayPayload {
    const { messages, systemPrompt } = this.serializePrompt(prompt);
    const list = (tools as ProviderToolConfig[] | undefined) ?? [];
    return {
      model_id: this.modelId,
      messages,
      system_prompt: systemPrompt,
      tools: list.map((t) => ({
        name: (t.name ?? (t.type === 'provider-defined' ? (t.id ?? '') : '')) || 'unknown',
        description: t.description ?? '',
        input_schema: t.inputSchema ?? t.args ?? {},
      })),
      temperature: temperature ?? 0.2,
    };
  }

  /** One gateway round trip returning the raw `output_text`. */
  async complete(
    prompt: unknown,
    tools?: unknown,
    temperature?: number,
  ): Promise<{ text: string; usage: GatewayUsage }> {
    if (!this.apiKey) {
      throw new Error('AI_API_KEY is not set in environment variables.');
    }
    const body = this.buildPayload(prompt, tools, temperature);
    const response = await fetch(`${this.baseUrl}/student/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorBody = (await response.text()).slice(0, 500);
      throw new Error(`Gateway LLM request failed (${response.status}): ${errorBody}`);
    }

    const json = (await response.json()) as {
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };
    const text = (json.output_text ?? '').trim();
    if (!text) {
      throw new Error('Gateway LLM returned an empty output_text.');
    }
    return {
      text,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
    };
  }

  /** Resolve a full decision or a tool call in one shot (non-streaming). */
  async generate(options: {
    prompt: unknown;
    tools?: unknown;
    temperature?: number;
  }): Promise<{ content: unknown[]; finishReason: 'stop' | 'tool-calls'; usage: GatewayUsage }> {
    const { text, usage } = await this.complete(options.prompt, options.tools, options.temperature);
    const call = this.parseToolCall(text, this.toolNames(options.tools));

    if (call) {
      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.argumentsJson,
          },
        ],
        finishReason: 'tool-calls',
        usage,
      };
    }
    return { content: [{ type: 'text', text }], finishReason: 'stop', usage };
  }

  /**
   * The `LanguageModelV2` surface consumed by Mastra. Both `doGenerate` and
   * `doStream` perform a single gateway round trip (the gateway is not truly
   * streaming) and replay the result as stream parts.
   */
  toLanguageModel(): LanguageModelV2 {
    const that = this;
    return {
      specificationVersion: 'v2',
      provider: 'iti-gateway',
      modelId: this.modelId,
      supportedUrls: this.supportedUrls,
      doGenerate: async (options: LanguageModelV2CallOptions) => {
        const { content, finishReason, usage } = await that.generate(options);
        return {
          content: content as never,
          finishReason: finishReason as never,
          usage: usage as never,
          warnings: [],
          request: { body: that.buildPayload(options.prompt as unknown, options.tools as unknown, options.temperature) },
          response: { id: randomUUID(), modelId: that.modelId },
        };
      },
      doStream: async (options: LanguageModelV2CallOptions) => {
        const { content, finishReason, usage } = await that.generate(options);
        return {
          stream: that.toStreamParts(content, finishReason, usage) as never,
          request: { body: that.buildPayload(options.prompt as unknown, options.tools as unknown, options.temperature) },
        };
      },
    } as unknown as LanguageModelV2;
  }

  private toStreamParts(
    content: unknown[],
    finishReason: string,
    usage: GatewayUsage,
  ): ReadableStream<Record<string, unknown>> {
    return this.toStream(content, finishReason, usage);
  }

  private toolNames(tools: unknown): Set<string> {
    const set = new Set<string>();
    for (const t of (tools as ProviderToolConfig[] | undefined) ?? []) {
      if (typeof t.name === 'string') set.add(t.name);
      if (t.type === 'provider-defined' && typeof t.id === 'string') set.add(t.id);
    }
    return set;
  }

  private toStream(
    content: unknown[],
    finishReason: string,
    usage: GatewayUsage,
  ): ReadableStream<StreamPart> {
    const runId = randomUUID();
    const parts: StreamPart[] = [];

    const first = content[0] as Record<string, unknown> | undefined;
    if (first?.type === 'tool-call') {
      const call = first as { toolCallId: string; toolName: string; input: string };
      parts.push({ type: 'tool-input-start', id: runId, toolName: call.toolName });
      parts.push({ type: 'tool-call', toolCallId: call.toolCallId, toolName: call.toolName, input: call.input });
      parts.push({ type: 'tool-input-end', id: runId });
    } else {
      parts.push({ type: 'text-start', id: runId });
      parts.push({ type: 'text-delta', id: runId, delta: (first?.text as string) ?? '' });
      parts.push({ type: 'text-end', id: runId });
    }
    parts.push({ type: 'finish', usage, finishReason });

    return new ReadableStream<StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    });
  }
}