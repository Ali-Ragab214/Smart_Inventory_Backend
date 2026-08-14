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
import { ToolExecutorService } from '../agents/tool-executor.service';
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
    private readonly toolExecutor: ToolExecutorService,
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

    let contextBlock = chunks
      .map((chunk, i) => `[Source ${i + 1} — ${chunk.sourceType}]\n${chunk.content}`)
      .join('\n\n');

    // Inject live inventory data if the user is asking about stockouts or low stock
    const isInventoryQuery = /stockout|low stock|at risk|reorder|out of stock/i.test(dto.query);
    let injectedSources: any[] = [];
    
    if (isInventoryQuery && user.tenantId) {
      try {
        const lowStockData = await this.toolExecutor.execute(user.tenantId, 'get_low_stock_skus', {});
        if (Array.isArray(lowStockData) && lowStockData.length > 0) {
          const summary = lowStockData.map((item: any) => 
            `SKU: ${item.sku?.sku || item.skuId}, Name: ${item.sku?.name || 'Unknown'}, Warehouse: ${item.warehouse?.name || 'Unknown'}, Quantity: ${item.quantity}, Reorder Threshold: ${item.reorderThreshold}`
          ).join('\n');
          
          contextBlock += `\n\n[Source Live Data — current low stock items]\n${summary}`;
          injectedSources.push({
            content: 'Live Database: Low Stock SKUs',
            sourceType: 'LIVE_DATA',
            score: 1.0,
          });
        } else if (Array.isArray(lowStockData) && lowStockData.length === 0) {
          contextBlock += `\n\n[Source Live Data — current low stock items]\nNo SKUs are currently at risk of stockout.`;
          injectedSources.push({
            content: 'Live Database: No low stock SKUs found',
            sourceType: 'LIVE_DATA',
            score: 1.0,
          });
        }
      } catch (err) {
        // Silently ignore if tool execution fails
      }
    }

    // 2. If no chunks found and no live data injected, return early with a canned response
    if ((!chunks || chunks.length === 0) && injectedSources.length === 0) {
      return successResponse({
        answer: NO_CONTEXT_ANSWER,
        sources: [],
      });
    }

    const systemPrompt = `${ASSISTANT_SYSTEM_PROMPT}\n\nContext:\n${contextBlock}`;

    // 4. Call gateway LLM with the grounded context — no tools, pure Q&A
    const answer = await this.gatewayLlm.chat(systemPrompt, dto.query);

    // 5. Return answer + sources
    const sources = chunks.map((chunk) => ({
      content: chunk.content,
      sourceType: chunk.sourceType,
      score: chunk.score,
    })).concat(injectedSources);

    return successResponse({ answer, sources });
  }
}
