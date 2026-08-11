import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RagService } from '../rag/rag.service';
import { GatewayLanguageModelAdapter } from './gateway-language-model.adapter';
import { ToolExecutorService } from './tool-executor.service';

export type AgentName = 'forecasting' | 'reorder' | 'negotiation';

type AgentSet = Record<AgentName, Agent>;

@Injectable()
export class MastraService {
  private readonly logger = new Logger(MastraService.name);
  private readonly modelAdapter: GatewayLanguageModelAdapter;
  private readonly tenantAgents = new Map<string, AgentSet>();
  private readonly mastra = new Mastra({ agents: {} });

  constructor(
    private readonly config: ConfigService,
    private readonly ragService: RagService,
    private readonly toolExecutor: ToolExecutorService,
  ) {
    this.modelAdapter = new GatewayLanguageModelAdapter(config);
    this.logger.log('Mastra framework initialized over the ITI gateway.');
  }

  /** Build (and cache) the 3 agents for one tenant, tools closed over tenantId. */
  private getAgents(tenantId: string): AgentSet {
    const cached = this.tenantAgents.get(tenantId);
    if (cached) return cached;

    const exec = (name: string) => (input: Record<string, unknown>) =>
      this.toolExecutor.execute(tenantId, name, input);

    const agents: AgentSet = {
      forecasting: new Agent({
        name: 'Forecasting Agent',
        id: 'forecasting-agent',
        instructions:
          'You are a demand forecasting assistant. Analyze the historical stock movements of each SKU using the provided tools and project future demand. Use get_marketing_calendar to check for marketing campaigns overlapping the forecast window: if a campaign covers a SKU, scale that SKU projectedDemand by its expectedDemandMultiplier and set influencedByCampaigns true. Base projections only on supplied movements; state the observed trend and your projected next-period demand per SKU concisely.',
        model: this.modelAdapter.toLanguageModel(),
        tools: {
          get_movement_history: createTool({
            id: 'get_movement_history',
            description: 'Get recent stock movement history for a SKU',
            inputSchema: z.object({ skuId: z.string().describe('The SKU UUID') }),
            execute: async (input) => exec('get_movement_history')(input as Record<string, unknown>),
          }),
          get_sku: createTool({
            id: 'get_sku',
            description: 'Get a SKU by its ID including current quantity and reorder threshold',
            inputSchema: z.object({ skuId: z.string().describe('The SKU UUID') }),
            execute: async (input) => exec('get_sku')(input as Record<string, unknown>),
          }),
          get_marketing_calendar: createTool({
            id: 'get_marketing_calendar',
            description: 'Get marketing/promotion campaigns overlapping a date range, optionally filtered by SKUs, with expected demand multipliers',
            inputSchema: z.object({
              skuIds: z.array(z.string()).optional().describe('Optional SKU UUIDs to filter by'),
              from: z.string().optional().describe('Start of the window (ISO date), defaults to today'),
              to: z.string().optional().describe('End of the window (ISO date), defaults to +90 days'),
            }),
            execute: async (input) => exec('get_marketing_calendar')(input as Record<string, unknown>),
          }),
        },
      }),

      reorder: new Agent({
        name: 'Reorder Agent',
        id: 'reorder-agent',
        instructions:
          'You are a purchasing / replenishment agent for an inventory management system. You receive JSON items at or below their reorder threshold. For each item use the get_vendors_for_sku tool to retrieve the REAL vendor catalog entries (price and lead time), pick a vendor for each item, use the ACTUAL catalog unitPrice, prefer the cheapest unitPrice or best lead time, and never invent a unitPrice absent from the catalog. Respond with ONLY a valid JSON object matching this schema, no markdown fences, no other text: {"reasoning": string, "confidenceScore": number 0-100, "paymentTerms": string, "items": [{"skuId": string, "sku": string, "productName": string, "warehouse": string, "vendorId": string, "vendorName": string, "unitPrice": number, "currentQuantity": number, "reorderThreshold": number, "recommendedQuantity": number, "lineTotal": number}]}.',
        model: this.modelAdapter.toLanguageModel(),
        tools: {
          get_vendors_for_sku: createTool({
            id: 'get_vendors_for_sku',
            description: 'Get all vendors that supply a given SKU, sorted by price ascending',
            inputSchema: z.object({ skuId: z.string().describe('The SKU UUID') }),
            execute: async (input) => exec('get_vendors_for_sku')(input as Record<string, unknown>),
          }),
          get_vendor_catalog_entry: createTool({
            id: 'get_vendor_catalog_entry',
            description: 'Get pricing and lead time for a specific vendor-SKU combination',
            inputSchema: z.object({
              vendorId: z.string().describe('The vendor UUID'),
              skuId: z.string().describe('The SKU UUID'),
            }),
            execute: async (input) => exec('get_vendor_catalog_entry')(input as Record<string, unknown>),
          }),
          get_low_stock_skus: createTool({
            id: 'get_low_stock_skus',
            description: 'Get all SKUs that are below or at their reorder threshold across all warehouses',
            inputSchema: z.object({}),
            execute: async () => exec('get_low_stock_skus')({}),
          }),
        },
      }),

      negotiation: new Agent({
        name: 'Vendor Negotiation Agent',
        id: 'negotiation-agent',
        instructions:
          'You are a vendor negotiation assistant. First use searchKnowledgeBase to find relevant past terms, pricing, or contract clauses for the given vendor. Then draft a professional email asking for a discount, better pricing, or improved payment terms. Do not invent facts not present in the knowledge base. Each knowledge chunk carries an ageDays field: if the most relevant pricing or contract data is older than 180 days, lower your confidenceScore and state in your reasoning that the retrieved data is stale. Respond with ONLY a valid JSON object, no markdown fences, no other text, matching this schema: {"subject": string, "emailContent": string, "requestedDiscountPercent": number, "confidenceScore": number 0-100, "reasoning": string}.',
        model: this.modelAdapter.toLanguageModel(),
        tools: {
          searchKnowledgeBase: createTool({
            id: 'searchKnowledgeBase',
            description: 'Search the vendor knowledge base (contracts, pricing catalogs, transcripts) for context before negotiating',
            inputSchema: z.object({
              query: z.string(),
              vendorId: z.string().uuid().optional(),
            }),
            execute: async (input) => {
              const { query, vendorId } = input as { query: string; vendorId?: string };
              return this.ragService.search(query, vendorId ? { vendorId } : {}, 5);
            },
          }),
          get_vendor: createTool({
            id: 'get_vendor',
            description: 'Get a vendor by its ID',
            inputSchema: z.object({ vendorId: z.string().describe('The vendor UUID') }),
            execute: async (input) => exec('get_vendor')(input as Record<string, unknown>),
          }),
        },
      }),
    };

    this.tenantAgents.set(tenantId, agents);
    return agents;
  }

  /**
   * Run a named agent for a tenant. Tools are tenant-scoped; the user message
   * carries the run context. Returns the final agent text (or structured JSON)
   * plus any tool calls executed during the run.
   */
  async runAgent(
    agentName: AgentName,
    tenantId: string,
    input: string,
    options: { runId?: string; maxSteps?: number } = {},
  ): Promise<{ text: string; toolCalls?: unknown[] }> {
    const agent = this.getAgents(tenantId)[agentName];
    const result = await agent.generate(
      [{ role: 'user', content: input }],
      {
        runId: options.runId,
        maxSteps: options.maxSteps ?? 6,
      },
    );

    return {
      text: typeof result.text === 'string' ? result.text : JSON.stringify(result),
      toolCalls: (result as { toolResults?: unknown[] }).toolResults,
    };
  }

  getMastra(): Mastra {
    return this.mastra;
  }
}