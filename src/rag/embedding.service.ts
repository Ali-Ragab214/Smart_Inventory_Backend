import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { pipeline, env } from '@xenova/transformers';
import type { FeatureExtractionPipeline } from '@xenova/transformers';

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSIONS = 384;

env.allowRemoteModels = true;

@Injectable()
export class EmbeddingService implements OnModuleDestroy {
  private pipeline: FeatureExtractionPipeline | null = null;
  private readonly logger = new Logger(EmbeddingService.name);

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipeline) {
      this.logger.log(`Loading local embedding model: ${EMBEDDING_MODEL}`);
      this.pipeline = (await pipeline(
        'feature-extraction',
        EMBEDDING_MODEL,
      )) as FeatureExtractionPipeline;
      this.logger.log('Embedding model loaded.');
    }
    return this.pipeline;
  }

  async embed(text: string): Promise<number[]> {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Embedding text must be a non-empty string.');
    }

    const p = await this.getPipeline();
    const output = await p(text, {
      pooling: 'mean',
      normalize: true,
    });

    const vector = Array.from(output.data as Float32Array);
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Unexpected embedding size: expected ${EMBEDDING_DIMENSIONS}, got ${vector.length}.`,
      );
    }
    return vector;
  }

  async onModuleDestroy(): Promise<void> {
    this.pipeline = null;
  }
}
