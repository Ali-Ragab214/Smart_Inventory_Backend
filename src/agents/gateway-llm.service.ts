import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GatewayLlmService {
  private readonly logger = new Logger(GatewayLlmService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('AI_API_URL') ||
      'http://apiaccess.iti.net.eg/api/v1'
    ).replace(/\/+$/, '');
  }

  private get apiKey(): string | undefined {
    return (
      this.config.get<string>('AI_API_KEY') ||
      this.config.get<string>('ANTHROPIC_API_KEY')
    );
  }

  private get model(): string {
    return (
      this.config.get<string>('AI_MODEL') || 'anthropic.claude-sonnet-4-6'
    );
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI_API_KEY is not set in environment variables.');
    }

    const response = await fetch(`${this.baseUrl}/student/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: this.model,
        messages: [{ role: 'user', content: userMessage }],
        system_prompt: systemPrompt,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(
        `Gateway LLM request failed (${response.status}): ${body}`,
      );
    }

    const json = (await response.json()) as { output_text?: string };
    return json.output_text ?? '';
  }
}