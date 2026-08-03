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

export interface SearchFilter {
  vendorId?: string;
  sourceType?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  sourceType: string;
  vendorId: string;
  score: number;
}

const MIN_SCORE_THRESHOLD = 0.3;

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

  /**
   * Semantic search over the knowledge base.
   * Embeds the query, finds the most similar chunks via cosine distance
   * (`<=>` operator), and returns them ranked with a similarity score.
   * Results below MIN_SCORE_THRESHOLD are too weak to be useful and are dropped.
   */
  async search(
    query: string,
    filters: SearchFilter = {},
    topK: number = 5,
  ): Promise<SearchResult[]> {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Query must not be empty.');
    }

    if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
      throw new BadRequestException('topK must be an integer between 1 and 20.');
    }

    const embedding = await this.embeddingService.embed(trimmed);
    const vectorLiteral = `[${embedding.join(',')}]`;

    // $1 is always the query vector. Subsequent params map to filters/LIMIT.
    const params: unknown[] = [vectorLiteral];
    const conditions: string[] = ['1=1'];

    if (filters.vendorId) {
      params.push(filters.vendorId);
      conditions.push(`"vendorId" = $${params.length}`);
    }
    if (filters.sourceType) {
      params.push(filters.sourceType);
      conditions.push(`"sourceType" = $${params.length}`);
    }

    params.push(topK);

    const sql = `
      SELECT id, content, "sourceType", "vendorId",
             1 - (embedding <=> $1::vector) AS score
      FROM knowledge_chunks
      WHERE ${conditions.join(' AND ')}
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $${params.length}
    `;

    const rows = (await this.dataSource.query(sql, params)) as Array<{
      id: string;
      content: string;
      sourceType: string;
      vendorId: string;
      score: number;
    }>;

    return rows
      .map((row) => ({
        id: row.id,
        content: row.content,
        sourceType: row.sourceType,
        vendorId: row.vendorId,
        score: typeof row.score === 'number' ? row.score : parseFloat(row.score),
      }))
      .filter((row) => row.score >= MIN_SCORE_THRESHOLD);
  }
}
