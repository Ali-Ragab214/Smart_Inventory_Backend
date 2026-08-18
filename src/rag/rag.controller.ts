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

Keep your answers concise and professional. When referencing data, cite specific numbers, dates, or terms from the context. 

IMPORTANT RULES:
- ALWAYS refer to products, SKUs, or items by their human-readable "Name". 
- NEVER use just the UUID/ID to refer to a product. If you include an ID, put it in parentheses after the product name.`;

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

  private async injectToolData(
    tenantId: string,
    toolName: string,
    label: string,
    format: (rows: any[]) => string,
    contextBlock: string,
    injectedSources: any[],
  ): Promise<string> {
    try {
      const rows = await this.toolExecutor.execute(tenantId, toolName, {});
      if (Array.isArray(rows) && rows.length > 0) {
        contextBlock += `\n\n[Source Live Data — ${label}]\n${format(rows)}`;
        injectedSources.push({
          content: `Live Database: ${label}`,
          sourceType: 'LIVE_DATA',
          score: 1.0,
        });
      } else if (Array.isArray(rows) && rows.length === 0) {
        contextBlock += `\n\n[Source Live Data — ${label}]\nNo ${label.toLowerCase()} found in the system.`;
        injectedSources.push({
          content: `Live Database: No ${label.toLowerCase()} found`,
          sourceType: 'LIVE_DATA',
          score: 1.0,
        });
      }
    } catch (err) {
      // Silently ignore if tool execution fails
    }
    return contextBlock;
  }

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
    const isLowStockQuery = /stockout|low stock|at risk|reorder|out of stock/i.test(dto.query);
    const isAllSkusQuery =
      /all skus|list skus|show skus|what skus|skus exist|warehouse|inventory|located|stock/i.test(
        dto.query,
      );
    const isVendorQuery = /vendor|supplier/i.test(dto.query);
    const isOrderQuery = /\bpurchase orders?\b|\border(s)?\b|\bordered\b|\bpo\b/i.test(dto.query);
    const isMovementQuery = /\bmovement(s)?\b|\bhistory\b|\breceipt(s)?\b|\btransfer(s)?\b|\bwrite.?off\b|\breturn(s)?\b|\bactivity\b/i.test(dto.query);
    const isForecastQuery = /\bforecast(s|ed)?\b|\bdemand\b|\bpredict(ed|ion)?\b|\bproject(ed|ion)?s?\b/i.test(dto.query);
    const isApprovalQuery = /\bapproval(s)?\b|\bapprove(d)?\b|\bawaiting review\b|\bpending review\b|\bneeds review\b/i.test(dto.query);
    const isNotificationQuery = /\bnotification(s)?\b|\balert(s)?\b|\bwarning(s)?\b|\breminder(s)?\b|\bunread\b/i.test(dto.query);
    const isStaffQuery = /\bstaff\b|\bteam\b|\bemployee(s)?\b|\bwho works\b|\bmanager(s)?\b|\buser(s)?\b/i.test(dto.query);
    const isAgentsQuery = /\bagent runs?\b|\bagents\b|\bautomation\b/i.test(dto.query);
    let injectedSources: any[] = [];
    
    if (isLowStockQuery && user.tenantId) {
      try {
        const lowStockData = await this.toolExecutor.execute(user.tenantId, 'get_low_stock_skus', {});
        if (Array.isArray(lowStockData) && lowStockData.length > 0) {
          const summary = lowStockData.map((item: any) => 
            `Name: ${item.skuName || 'Unknown'} (SKU ID: ${item.skuId}), Warehouse: ${item.warehouseName || 'Unknown'} (${item.warehouseLocation || 'location unknown'}), Quantity: ${item.quantity}, Reorder Threshold: ${item.reorderThreshold}`
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

    if (isAllSkusQuery && user.tenantId) {
      try {
        const stockLevels = await this.toolExecutor.execute(user.tenantId, 'get_inventory_status', {});
        if (Array.isArray(stockLevels) && stockLevels.length > 0) {
          const summary = stockLevels.map((item: any) => 
            `Name: ${item.skuName || 'Unknown'} (SKU: ${item.skuId}) - Quantity: ${item.quantity} in Warehouse: ${item.warehouseName || 'Unknown'} (${item.warehouseLocation || 'location unknown'})`
          ).join('\n');
          
          contextBlock += `\n\n[Source Live Data — list of all SKUs and their locations]\n${summary}`;
          injectedSources.push({
            content: 'Live Database: All Stock Levels',
            sourceType: 'LIVE_DATA',
            score: 1.0,
          });
        } else if (Array.isArray(stockLevels) && stockLevels.length === 0) {
          contextBlock += `\n\n[Source Live Data — list of all SKUs]\nNo SKUs found in the system.`;
          injectedSources.push({
            content: 'Live Database: No SKUs found',
            sourceType: 'LIVE_DATA',
            score: 1.0,
          });
        }
      } catch (err) {
        // Silently ignore if tool execution fails
      }
    }

    if (isVendorQuery && user.tenantId) {
      try {
        const vendors = await this.toolExecutor.execute(user.tenantId, 'get_all_vendors', {});
        if (Array.isArray(vendors) && vendors.length > 0) {
          const summary = vendors
            .map(
              (v: any) =>
                `Name: ${v.name || 'Unknown'} (Tier: ${v.tier || 'n/a'}, Email: ${v.contactEmail || 'n/a'})`,
            )
            .join('\n');

          contextBlock += `\n\n[Source Live Data — current vendors]\n${summary}`;
          injectedSources.push({
            content: 'Live Database: All Vendors',
            sourceType: 'LIVE_DATA',
            score: 1.0,
          });
        } else if (Array.isArray(vendors) && vendors.length === 0) {
          contextBlock += `\n\n[Source Live Data — current vendors]\nNo vendors found in the system.`;
          injectedSources.push({
            content: 'Live Database: No vendors found',
            sourceType: 'LIVE_DATA',
            score: 1.0,
          });
        }
      } catch (err) {
        // Silently ignore if tool execution fails
      }
    }

    if (isOrderQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_purchase_orders',
        'Purchase Orders',
        (rows) =>
          rows
            .map(
              (po: any) =>
                `PO ${po.id} (vendor: ${po.vendorName || po.vendorId}, status: ${po.status}, warehouse: ${po.warehouseName || 'unknown'} (${po.warehouseLocation || ''}), createdBy: ${po.createdBy}) - items: ${
                  po.lineItems
                    .map((li: any) => `${li.skuName || li.skuCode || li.skuId} x${li.quantity} @ $${li.unitPrice}`)
                    .join(', ') || 'none'
                }`,
            )
            .join('\n'),
        contextBlock,
        injectedSources,
      );
    }

    if (isMovementQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_recent_movements',
        'Recent Stock Movements',
        (rows) =>
          rows
            .map(
              (m: any) =>
                `${m.skuName || m.skuCode || m.skuId}: ${m.reason} ${m.quantityChange} units (balance ${m.balanceAfter}) in ${m.warehouseName || 'unknown'}${m.note ? ` - ${m.note}` : ''}`,
            )
            .join('\n'),
        contextBlock,
        injectedSources,
      );
    }

    if (isForecastQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_forecasts',
        'Demand Forecasts',
        (rows) =>
          rows
            .map(
              (f: any) =>
                `${f.skuName || f.skuCode || f.skuId}: projected demand ${f.projectedDemand} units (confidence ${f.confidenceScore}%, model ${f.model}), period ${String(f.periodStart).slice(0, 10)} to ${String(f.periodEnd).slice(0, 10)}${f.reasoning ? ` - reasoning: ${f.reasoning}` : ''}`,
            )
            .join('\n'),
        contextBlock,
        injectedSources,
      );
    }

    if (isApprovalQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_approval_requests',
        'Approval Requests',
        (rows) =>
          rows
            .map(
              (a: any) =>
                `${a.agentType} request [status: ${a.status}]: ${a.reasoning || ''} payload=${JSON.stringify(a.payload ?? {}).slice(0, 300)}`,
            )
            .join('\n'),
        contextBlock,
        injectedSources,
      );
    }

    if (isNotificationQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_notifications',
        'Notifications & Alerts',
        (rows) =>
          rows
            .map((n: any) => `[${n.type}] ${n.title}: ${n.message}`)
            .join('\n'),
        contextBlock,
        injectedSources,
      );
    }

    if (isStaffQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_staff',
        'Staff',
        (rows) =>
          rows
            .map(
              (u: any) =>
                `${u.name} (${u.username || u.email}), role: ${u.role}, warehouse: ${u.warehouseName || 'n/a'}, active: ${u.isActive}`,
            )
            .join('\n'),
        contextBlock,
        injectedSources,
      );
    }

    if (isAgentsQuery && user.tenantId) {
      contextBlock = await this.injectToolData(
        user.tenantId,
        'get_agent_runs',
        'Agent Runs',
        (rows) =>
          rows
            .map((r: any) => `${r.agentType} run [status: ${r.status}]`)
            .join('\n'),
        contextBlock,
        injectedSources,
      );
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
