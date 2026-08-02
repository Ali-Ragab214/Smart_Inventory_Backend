import { Injectable } from '@nestjs/common';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

@Injectable()
export class EmbeddingService {
  async embed(text: string): Promise<number[]> {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Embedding text must be a non-empty string.');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set in environment variables. Embedding features are unavailable.',
      );
    }

    let response: Response;
    try {
      response = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
        }),
      });
    } catch (err) {
      throw new Error(
        `OpenAI embeddings request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI embeddings request failed with status ${response.status}: ${body}`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error(
        `Failed to parse OpenAI embeddings response: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const embedding = (
      data as { data?: Array<{ embedding?: unknown }> }
    ).data?.[0]?.embedding;

    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMENSIONS
    ) {
      throw new Error(
        `Unexpected embeddings response: expected a ${EMBEDDING_DIMENSIONS}-dimensional vector.`,
      );
    }

    return embedding as number[];
  }
}
