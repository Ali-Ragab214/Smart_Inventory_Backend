import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { RagService, SearchResult } from '../rag/rag.service';
import { EmbeddingService } from '../rag/embedding.service';

export interface ProceduralToolResult {
  id: string;
  name: string;
  description: string;
  parametersSchema: any;
  score: number;
}

const MIN_SCORE_THRESHOLD = 0.3;

@Injectable()
export class MemoryManagerService implements OnModuleInit {
  private readonly logger = new Logger(MemoryManagerService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AgentRun) private readonly agentRunRepo: Repository<AgentRun>,
    @InjectRepository(AgentStep) private readonly agentStepRepo: Repository<AgentStep>,
    private readonly ragService: RagService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Ensure the vector extension and column exist on agent_tools
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.dataSource.query(
      'ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS embedding vector(384)',
    );
    try {
      await this.dataSource.query(
        'CREATE INDEX IF NOT EXISTS agent_tools_embedding_idx ON agent_tools USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
      );
    } catch (e) {
      this.logger.warn('Index agent_tools_embedding_idx already exists.');
    }
    this.logger.log('MemoryManagerService: pgvector column ensured on agent_tools.');

    // Seed the available tools for Procedural Memory
    await this.seedTools();
  }

  private async seedTools(): Promise<void> {
    const { AVAILABLE_TOOLS } = await import('./tool-executor.service');
    
    // Also include the searchKnowledgeBase tool from MastraService implicitly
    const allTools = [
      ...AVAILABLE_TOOLS,
      {
        name: 'searchKnowledgeBase',
        description: 'Search the vendor knowledge base (contracts, pricing catalogs, transcripts) for context before negotiating',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            vendorId: { type: 'string' },
          },
          required: ['query'],
        },
      }
    ];

    for (const tool of allTools) {
      await this.upsertProceduralTool(tool.name, tool.description, tool.input_schema);
    }
    this.logger.log(`Seeded ${allTools.length} tools into procedural memory.`);
  }

  /**
   * Retrieves semantic memory (facts, guidelines, history).
   * Relies on the existing RagService implementation.
   */
  async retrieveSemantic(
    query: string,
    filters?: { vendorId?: string; tenantId?: string },
    topK = 5,
  ): Promise<SearchResult[]> {
    return this.ragService.search(query, filters, topK);
  }

  /**
   * Retrieves episodic memory (past chronological steps of a specific run).
   */
  async retrieveEpisodic(agentRunId: string): Promise<AgentStep[]> {
    return this.agentStepRepo.find({
      where: { agentRunId: agentRunId },
      order: { stepNumber: 'ASC' },
    });
  }

  /**
   * Retrieves recent completed agent runs for a specific vendor (Episodic context).
   */
  async retrieveRecentEpisodicContext(vendorId: string, limit = 3): Promise<AgentRun[]> {
    return this.agentRunRepo.find({
      where: { relatedVendorId: vendorId, status: 'completed' as any },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['steps'],
    });
  }

  /**
   * Retrieves procedural memory (tools) dynamically using vector search.
   */
  async retrieveProcedural(query: string, topK = 5): Promise<ProceduralToolResult[]> {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) {
      this.logger.warn('Empty query provided for procedural retrieval. Returning empty tools.');
      return [];
    }

    const embedding = await this.embeddingService.embed(trimmed);
    const vectorLiteral = `[${embedding.join(',')}]`;

    const sql = `
      SELECT id, name, description, "parametersSchema",
             1 - (embedding <=> $1::vector) AS score
      FROM agent_tools
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $2
    `;

    const rows = (await this.dataSource.query(sql, [vectorLiteral, topK])) as Array<{
      id: string;
      name: string;
      description: string;
      parametersSchema: any;
      score: number;
    }>;

    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        parametersSchema: row.parametersSchema,
        score: typeof row.score === 'number' ? row.score : parseFloat(row.score as any),
      }))
      .filter((row) => row.score >= MIN_SCORE_THRESHOLD);
  }

  /**
   * Insert or update a procedural tool's embedding.
   */
  async upsertProceduralTool(name: string, description: string, parametersSchema: any): Promise<void> {
    const embedding = await this.embeddingService.embed(`${name}: ${description}`);
    const vectorLiteral = `[${embedding.join(',')}]`;

    await this.dataSource.query(
      `
      INSERT INTO agent_tools (id, name, description, "parametersSchema", embedding, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3, $4::vector, NOW(), NOW())
      ON CONFLICT (name) DO UPDATE 
      SET description = EXCLUDED.description,
          "parametersSchema" = EXCLUDED."parametersSchema",
          embedding = EXCLUDED.embedding,
          "updatedAt" = NOW()
      `,
      [name, description, parametersSchema, vectorLiteral],
    );
  }
}
