import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmbeddingService } from './embedding.service';
import { KnowledgeSourceType } from './entities/knowledge-chunk.entity';

export interface IngestResult {
  id: string;
  content: string;
  sourceType: string;
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    // TypeORM synchronize drops the `embedding` column at startup because the
    // entity cannot declare the pgvector type. Re-ensure the vector schema.
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.dataSource.query(
      'ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(384)',
    );
    await this.dataSource.query(
      'CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
    );
    this.logger.log('pgvector embedding column ensured.');
  }

  async ingest(
    content: string,
    sourceType: KnowledgeSourceType,
    meta: { vendorId?: string; skuId?: string } = {},
  ): Promise<IngestResult> {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Content must not be empty.');
    }

    const validTypes = Object.values(KnowledgeSourceType);
    if (!validTypes.includes(sourceType)) {
      throw new BadRequestException(
        `Invalid sourceType. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    const embedding = await this.embeddingService.embed(trimmed);
    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows = await this.dataSource.query(
      `INSERT INTO knowledge_chunks (id, content, "sourceType", "vendorId", "skuId", embedding, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, NOW())
       RETURNING id, content, "sourceType", "vendorId", "skuId", "createdAt"`,
      [trimmed, sourceType, meta.vendorId ?? null, meta.skuId ?? null, vectorLiteral],
    );

    const row = rows[0] as {
      id: string;
      content: string;
      sourceType: string;
    };

    return {
      id: row.id,
      content: row.content,
      sourceType: row.sourceType,
    };
  }
}
