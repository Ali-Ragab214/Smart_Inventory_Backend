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
  tenantId?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  sourceType: string;
  vendorId: string;
  score: number;
  ageDays: number;
}

const MIN_SCORE_THRESHOLD = 0.3;

/**
 * Freshness weighting: chunks lose ranking weight as they age so agents don't
 * anchor on stale contracts/pricing. Fresh data (<= FRESHNESS_FULL_DAYS old)
 * keeps its full similarity score; the weight decays linearly to
 * FRESHNESS_FLOOR once a chunk is FRESHNESS_STALE_DAYS or older.
 */
const FRESHNESS_FULL_DAYS = 90;
const FRESHNESS_STALE_DAYS = 365;
const FRESHNESS_FLOOR = 0.6;

function freshnessDecay(ageDays: number): number {
  if (ageDays <= FRESHNESS_FULL_DAYS) return 1;
  if (ageDays >= FRESHNESS_STALE_DAYS) return FRESHNESS_FLOOR;
  const progress = (ageDays - FRESHNESS_FULL_DAYS) / (FRESHNESS_STALE_DAYS - FRESHNESS_FULL_DAYS);
  return 1 - progress * (1 - FRESHNESS_FLOOR);
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
    try {
      await this.dataSource.query(
        'CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
      );
    } catch (e) {
      this.logger.warn('Index knowledge_chunks_embedding_idx already exists or concurrent creation ignored.');
    }

    // TypeORM synchronize does not add new labels to an existing Postgres enum
    // type in place; register the feedback source type explicitly so the
    // Feedback Agent's reviews can be stored on pre-seeded databases.
    try {
      await this.dataSource.query(
        "ALTER TYPE knowledge_chunks_sourceType_enum ADD VALUE IF NOT EXISTS 'vendor_performance_review'",
      );
    } catch (e) {
      this.logger.warn('knowledge_chunks sourceType enum already up to date.');
    }

    // Phase 1 — add entity/tenant scoping columns for event-driven ingestion.
    // These columns let us upsert (replace stale) chunks keyed by source entity
    // and scope all retrieval per tenant.
    await this.dataSource.query(`
      ALTER TABLE knowledge_chunks
        ADD COLUMN IF NOT EXISTS "tenantId" uuid,
        ADD COLUMN IF NOT EXISTS "entityType" varchar(50),
        ADD COLUMN IF NOT EXISTS "entityId" uuid
    `);
    await this.dataSource.query(
      'CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entity ON knowledge_chunks ("entityType", "entityId")',
    );
    await this.dataSource.query(
      'CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant ON knowledge_chunks ("tenantId")',
    );

    // The same sync also wipes the stored vectors for rows that survive. Any
    // chunk whose embedding is NULL (lost on a previous restart) is re-embedded
    // from its text content so the knowledge base stays self-healing.
    try {
      const rows = (await this.dataSource.query(
        'SELECT id, content FROM knowledge_chunks WHERE embedding IS NULL',
      )) as Array<{ id: string; content: string }>;
      if (rows.length > 0) {
        for (const row of rows) {
          const vector = await this.embeddingService.embed(row.content);
          const vectorLiteral = `[${vector.join(',')}]`;
          await this.dataSource.query(
            'UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2',
            [vectorLiteral, row.id],
          );
        }
        this.logger.log(
          `Re-embedded ${rows.length} knowledge chunk(s) that had lost their vectors.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Re-embedding knowledge chunks failed: ${(err as Error).message}`,
      );
    }
    this.logger.log('pgvector embedding column ensured.');
  }

  async ingest(
    content: string,
    sourceType: KnowledgeSourceType,
    meta: {
      vendorId?: string;
      skuId?: string;
      tenantId?: string;
      entityType?: string;
      entityId?: string;
    } = {},
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
      `INSERT INTO knowledge_chunks (id, content, "sourceType", "vendorId", "skuId", "tenantId", "entityType", "entityId", embedding, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::vector, NOW())
       RETURNING id, content, "sourceType", "vendorId", "skuId", "tenantId", "entityType", "entityId", "createdAt"`,
      [
        trimmed,
        sourceType,
        meta.vendorId ?? null,
        meta.skuId ?? null,
        meta.tenantId ?? null,
        meta.entityType ?? null,
        meta.entityId ?? null,
        vectorLiteral,
      ],
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
   * Scores are freshness-decayed by chunk age (see freshnessDecay) so stale
   * contracts/pricing rank lower and can be flagged to reviewers. Results
   * below MIN_SCORE_THRESHOLD (after decay) are too weak to be useful and are dropped.
   * When tenantId is provided, results are scoped to that tenant (plus legacy
   * chunks with NULL tenantId for backward compatibility).
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

    if (filters.tenantId) {
      params.push(filters.tenantId);
      conditions.push(`("tenantId" = $${params.length} OR "tenantId" IS NULL)`);
    }
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
      SELECT id, content, "sourceType", "vendorId", "createdAt",
             1 - (embedding <=> $1::vector) AS score
      FROM knowledge_chunks
      WHERE ${conditions.join(' AND ')}
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $${params.length}
    `;

    const now = Date.now();
    const rows = (await this.dataSource.query(sql, params)) as Array<{
      id: string;
      content: string;
      sourceType: string;
      vendorId: string;
      createdAt: string;
      score: number;
    }>;

    const results = rows
      .map((row) => {
        const rawScore = typeof row.score === 'number' ? row.score : parseFloat(row.score);
        const ageDays = Math.max(
          0,
          Math.round((now - new Date(row.createdAt).getTime()) / 86_400_000),
        );
        return {
          id: row.id,
          content: row.content,
          sourceType: row.sourceType,
          vendorId: row.vendorId,
          score: rawScore * freshnessDecay(ageDays),
          ageDays,
        };
      })
      .filter((row) => row.score >= MIN_SCORE_THRESHOLD);

    if (results.length < topK) {
      const missing = topK - results.length;
      const fallback = await this.keywordFallback(trimmed, filters, missing);
      const seen = new Set(results.map((r) => r.id));
      results.push(...fallback.filter((r) => !seen.has(r.id)));
    }
    return results;
  }

  private readonly STOPWORDS = new Set([
    'give', 'me', 'all', 'the', 'in', 'a', 'an', 'of', 'and', 'or', 'to',
    'for', 'what', 'which', 'list', 'show', 'only', 'are', 'is', 'at',
    'with', 'from', 'on', 'how', 'many', 'do', 'we', 'have', 'stored',
    'warehouse', 'inventory', 'located', 'there', 'any', 'items', 'item',
    'sku', 'skus', 'can', 'you', 'tell', 'please', 'want', 'get', 'info',
    'information', 'about', 'than', 'out', 'when', 'where', 'was', 'were',
  ]);

  /**
   * Keyword fallback (ILIKE) for queries whose embedding similarity is too
   * weak (nicknames, city names, typos). Ranks by number of matched terms so
   * entity/city mentions still surface the right chunk.
   */
  private async keywordFallback(
    query: string,
    filters: SearchFilter,
    limit: number,
  ): Promise<SearchResult[]> {
    const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const keywords = [...new Set(tokens.filter((t) => t.length >= 3 && !this.STOPWORDS.has(t)))];
    if (keywords.length === 0 || limit <= 0) return [];

    const params: unknown[] = [];
    const like: string[] = [];
    for (const kw of keywords) {
      params.push(`%${kw}%`);
      like.push(`content ILIKE $${params.length}`);
    }

    const conditions: string[] = [`(${like.join(' OR ')})`];
    if (filters.tenantId) {
      params.push(filters.tenantId);
      conditions.push(`("tenantId" = $${params.length} OR "tenantId" IS NULL)`);
    }
    if (filters.vendorId) {
      params.push(filters.vendorId);
      conditions.push(`"vendorId" = $${params.length}`);
    }
    if (filters.sourceType) {
      params.push(filters.sourceType);
      conditions.push(`"sourceType" = $${params.length}`);
    }
    params.push(limit);

    const matchCount = like.map((_, i) => `(content ILIKE $${i + 1})::int`).join(' + ');
    const sql = `
      SELECT id, content, "sourceType", "vendorId", "createdAt",
             LEAST(0.9, 0.45 + 0.15 * (${matchCount})) AS score
      FROM knowledge_chunks
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${matchCount} DESC, "createdAt" DESC
      LIMIT $${params.length}
    `;

    const now = Date.now();
    const rows = (await this.dataSource.query(sql, params)) as Array<{
      id: string;
      content: string;
      sourceType: string;
      vendorId: string;
      createdAt: string;
      score: number;
    }>;

    return rows.map((row) => {
      const rawScore = typeof row.score === 'number' ? row.score : parseFloat(row.score);
      const ageDays = Math.max(
        0,
        Math.round((now - new Date(row.createdAt).getTime()) / 86_400_000),
      );
      return {
        id: row.id,
        content: row.content,
        sourceType: row.sourceType,
        vendorId: row.vendorId,
        score: rawScore * freshnessDecay(ageDays),
        ageDays,
      };
    });
  }

  /**
   * Upsert a knowledge chunk keyed by (tenantId, entityType, entityId).
   * Deletes any existing chunk for the same entity first, then ingests fresh.
   * This ensures answers don't go stale when source data changes.
   */
  async upsertForEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    sourceType: KnowledgeSourceType,
    content: string,
    meta: { vendorId?: string; skuId?: string } = {},
  ): Promise<IngestResult> {
    // Remove old chunk(s) for this entity
    await this.dataSource.query(
      `DELETE FROM knowledge_chunks WHERE "tenantId" = $1 AND "entityType" = $2 AND "entityId" = $3`,
      [tenantId, entityType, entityId],
    );

    // Ingest fresh
    return this.ingest(content, sourceType, {
      ...meta,
      tenantId,
      entityType,
      entityId,
    });
  }

  /**
   * Remove all knowledge chunks for a given entity.
   * Used when the source entity is deleted (e.g. catalog entry removed).
   */
  async removeForEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<number> {
    const result = await this.dataSource.query(
      `DELETE FROM knowledge_chunks WHERE "tenantId" = $1 AND "entityType" = $2 AND "entityId" = $3`,
      [tenantId, entityType, entityId],
    );
    return Array.isArray(result) ? result.length : (result as { rowCount?: number })?.rowCount ?? 0;
  }
}
