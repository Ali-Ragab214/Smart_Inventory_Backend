import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../utils/response.util';
import { RagService } from './rag.service';
import { GatewayLlmService } from '../agents/gateway-llm.service';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import {
  AskAssistantDto,
  IngestKnowledgeChunkDto,
  SearchKnowledgeChunkDto,
} from './schemas/knowledge-chunk.schema';

const ASSISTANT_SYSTEM_PROMPT = `You are a helpful inventory management assistant for StockSavvy. Answer the user's question using ONLY the information provided in the context below. If the context doesn't contain enough information to answer, say so clearly. Do not make up information not present in the context.

Keep your answers concise and professional. When referencing data, cite specific numbers, dates, or terms from the context.`;

const NO_CONTEXT_ANSWER =
  "I don't have enough information to answer that question. Try ingesting more documents first.";

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly gatewayLlm: GatewayLlmService,
  ) {}

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest a document chunk into the knowledge base' })
  @ApiCreatedResponse({ description: 'Chunk ingested successfully' })
  @ApiBadRequestResponse({ description: 'Empty content or invalid sourceType' })
  async ingest(
    @Body() dto: IngestKnowledgeChunkDto,
    @CurrentUser() user: { tenantId: string | null },
  ) {
    const data = await this.ragService.ingest(dto.content, dto.sourceType, {
      vendorId: dto.vendorId,
      skuId: dto.skuId,
      tenantId: user.tenantId ?? undefined,
    });
    return successResponse(data);
  }

  @Post('search')
  @ApiOperation({ summary: 'Semantic search across the knowledge base' })
  @ApiOkResponse({ description: 'Ranked semantically-similar chunks' })
  @ApiBadRequestResponse({ description: 'Empty query, invalid topK, or bad filter' })
  async search(
    @Body() dto: SearchKnowledgeChunkDto,
    @CurrentUser() user: { tenantId: string | null },
  ) {
    const data = await this.ragService.search(
      dto.query,
      {
        vendorId: dto.vendorId,
        sourceType: dto.sourceType,
        tenantId: user.tenantId ?? undefined,
      },
      dto.topK ?? 5,
    );
    return successResponse(data);
  }

  @Post('assistant')
  @ApiOperation({ summary: 'Ask the AI assistant a question grounded in the knowledge base' })
  @ApiOkResponse({ description: 'Grounded answer with source chunks' })
  @ApiBadRequestResponse({ description: 'Empty query' })
  async askAssistant(
    @Body() dto: AskAssistantDto,
    @CurrentUser() user: { tenantId: string | null },
  ) {
    // 1. Retrieve top 5 relevant chunks (tenant-scoped)
    const chunks = await this.ragService.search(
      dto.query,
      {
        vendorId: dto.vendorId,
        tenantId: user.tenantId ?? undefined,
      },
      5,
    );

    // 2. If no chunks found, return early with a canned response
    if (!chunks || chunks.length === 0) {
      return successResponse({
        answer: NO_CONTEXT_ANSWER,
        sources: [],
      });
    }

    // 3. Build the grounded prompt with retrieved context
    const contextBlock = chunks
      .map((chunk, i) => `[Source ${i + 1} — ${chunk.sourceType}]\n${chunk.content}`)
      .join('\n\n');

    const systemPrompt = `${ASSISTANT_SYSTEM_PROMPT}\n\nContext:\n${contextBlock}`;

    // 4. Call gateway LLM with the grounded context — no tools, pure Q&A
    const answer = await this.gatewayLlm.chat(systemPrompt, dto.query);

    // 5. Return answer + sources
    const sources = chunks.map((chunk) => ({
      content: chunk.content,
      sourceType: chunk.sourceType,
      score: chunk.score,
    }));

    return successResponse({ answer, sources });
  }
}
