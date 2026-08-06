import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentRunService, AgentType } from './agent-run.service';
import { GatewayLlmService } from './gateway-llm.service';
import { ApprovalQueueService } from './approval-queue.service';
import { RagService, SearchResult } from '../rag/rag.service';
import { StockLevel } from '../inventory/stock-levels/entities/stock-level.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Sku } from '../sku/entities/sku.entity';

@Processor('agent-jobs')
export class AgentsProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentsProcessor.name);

  constructor(
    private readonly gatewayLlm: GatewayLlmService,
    private readonly agentRunService: AgentRunService,
    private readonly approvalQueueService: ApprovalQueueService,
    private readonly ragService: RagService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<{ runId: string; agentType: AgentType; tenantId: string }>): Promise<void> {
    if (job.name !== 'run-agent-step') return;

    const { runId, agentType, tenantId } = job.data;
    this.logger.log(`Processing agent job: ${agentType} run ${runId}`);

    const runDetails = await this.agentRunService.load(tenantId, runId);
    if (!runDetails.data) return;

    const run = runDetails.data.run as any;

    try {
      if (agentType === 'reorder') {
        await this.runReorder(tenantId, run, runId);
      } else if (agentType === 'negotiation') {
        await this.runNegotiation(tenantId, run, runId);
      } else {
        await this.runGeneric(tenantId, run, runId, agentType);
      }
    } catch (error) {
      this.logger.error(`Agent ${agentType} failed`, error as Error);
      await this.agentRunService.appendStep(
        tenantId,
        runId,
        { input: 'Error' },
        { error: error instanceof Error ? error.message : String(error) },
        'Agent Execution Failed',
      );
      await this.agentRunService.updateStatus(tenantId, runId, 'escalated');
    }
  }

  private async runReorder(tenantId: string, run: any, runId: string): Promise<void> {
    const skuIds: string[] = run.skuIds ?? [];

    const levels = await this.dataSource
      .getRepository(StockLevel)
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.tenantId = :tenantId', { tenantId })
      .andWhere(skuIds.length > 0 ? 'sl.skuId IN (:...skuIds)' : '1=1', skuIds.length > 0 ? { skuIds } : {})
      .getMany();

    const lowStock = levels.filter(
      (sl) => sl.reorderThreshold > 0 && sl.quantity <= sl.reorderThreshold,
    );

    if (lowStock.length === 0) {
      await this.agentRunService.appendStep(
        tenantId,
        runId,
        { input: `Reorder check for ${skuIds.length} SKU(s)` },
        { result: 'No SKU is currently at or below its reorder threshold.' },
        'No replenishment required at this time',
      );
      await this.agentRunService.updateStatus(tenantId, runId, 'completed');
      return;
    }

    const context = lowStock.map((sl) => ({
      skuId: sl.skuId,
      sku: sl.sku?.sku,
      productName: sl.sku?.name,
      warehouse: sl.warehouse?.name,
      warehouseId: sl.warehouse?.id,
      quantity: sl.quantity,
      reorderThreshold: sl.reorderThreshold,
      safetyStock: sl.safetyStock,
    }));

    const systemPrompt =
      'You are a purchasing / replenishment agent for an inventory management system. ' +
      'You receive JSON items that are at or below their reorder threshold. ' +
      'Draft a purchase order recommendation and respond with ONLY a valid JSON object matching this schema, no markdown fences, no other text:\n' +
      '{"reasoning": string, "confidenceScore": number 0-100, "paymentTerms": string, ' +
      '"items": [{"skuId": string, "sku": string, "productName": string, "warehouse": string, ' +
      '"currentQuantity": number, "reorderThreshold": number, "recommendedQuantity": number, ' +
      '"unitPrice": number, "lineTotal": number}]}';

    const raw = await this.gatewayLlm.chat(
      systemPrompt,
      JSON.stringify({ lowStockItems: context }),
    );

    let draft: Record<string, unknown> = {};
    try {
      draft = JSON.parse(this.stripFences(raw));
    } catch {
      draft = { rawDraft: raw };
    }

    const items = Array.isArray(draft.items)
      ? (draft.items as Array<{ lineTotal?: number | string }>)
      : [];
    const proposedValue = items.reduce(
      (sum, item) => sum + Number(item.lineTotal || 0),
      0,
    );

    // Re-attach the canonical warehouseId to each AI line item by matching
    // the SKU (+ warehouse name) back to the low-stock context we sent.
    const itemWithWarehouseId = (item: Record<string, unknown>): Record<string, unknown> => {
      const skuId = (item.skuId ?? item.sku) as string | undefined;
      const warehouseName = item.warehouse as string | undefined;
      const match =
        skuId && warehouseName
          ? context.find(
              (c) => c.skuId === skuId && (c.warehouse ?? '') === warehouseName,
            )
          : undefined;
      const singleSku = context.filter((c) => c.skuId === skuId);
      const fallback = singleSku.length === 1 ? singleSku[0].warehouseId : undefined;
      return {
        ...item,
        warehouseId:
          match?.warehouseId ??
          fallback ??
          (typeof item.warehouseId === 'string' ? item.warehouseId : null),
      };
    };

    const payload = {
      ...draft,
      items: items.map(itemWithWarehouseId),
      proposedValue,
      currency: 'USD',
      vendorId: await this.resolveVendorId(run),
      generatedAt: new Date().toISOString(),
    };

    await this.approvalQueueService.create(tenantId, {
      agentRunId: runId,
      agentType: 'reorder',
      stepNumber: 1,
      payload,
      reasoning:
        typeof draft.reasoning === 'string'
          ? draft.reasoning
          : 'Reorder Agent drafted a purchase order for low-stock items.',
    });

    await this.agentRunService.appendStep(
      tenantId,
      runId,
      { input: 'Reorder workflow' },
      { result: payload },
      'Purchase order drafted and submitted for approval',
    );
    await this.agentRunService.updateStatus(tenantId, runId, 'awaiting_approval');
    this.logger.log(`Reorder agent completed; approval submitted for run ${runId}.`);
  }

  private async runNegotiation(tenantId: string, run: any, runId: string): Promise<void> {
    const vendorId: string | null = await this.resolveVendorId(run);

    let vendorName: string | null = null;
    if (vendorId) {
      try {
        const vendor = await this.dataSource
          .getRepository(Vendor)
          .createQueryBuilder('vendor')
          .select('vendor.name', 'name')
          .where('vendor.id = :id', { id: vendorId })
          .getRawOne();
        vendorName = vendor?.name ?? null;
      } catch (err) {
        this.logger.warn(`Failed to load vendor name: ${(err as Error).message}`);
      }
    }

    let kbContext = 'NO_KNOWLEDGE_BASE_DATA_FOUND';
    try {
      const results: SearchResult[] = await this.ragService.search(
        'vendor pricing discount contract payment terms',
        vendorId ? { vendorId } : {},
        5,
      );
      if (results.length > 0) {
        kbContext = results.map((r) => r.content).join('\n---\n');
      }
    } catch (err) {
      this.logger.warn(`Knowledge base search failed: ${(err as Error).message}`);
    }

    const systemPrompt =
      'You are a vendor negotiation agent for an inventory system. ' +
      'Using ONLY the provided vendor knowledge base context, draft a professional email to the vendor ' +
      'requesting a discount, better pricing, or improved payment terms. Do not invent facts that are not present in the context. ' +
      'Respond with ONLY a valid JSON object, no markdown fences, no other text, matching this schema:\n' +
      '{"subject": string, "emailContent": string, "requestedDiscountPercent": number, "confidenceScore": number 0-100, "reasoning": string}';

    const raw = await this.gatewayLlm.chat(
      systemPrompt,
      `Vendor ID: ${vendorId ?? 'unknown'}\nVendor name: ${vendorName ?? 'unknown'}\n\nKnowledge base context:\n${kbContext}`,
    );

    let draft: Record<string, unknown> = {};
    try {
      draft = JSON.parse(this.stripFences(raw));
    } catch {
      draft = { emailContent: raw };
    }

    const payload = {
      vendorId,
      emailContent: typeof draft.emailContent === 'string' ? draft.emailContent : '',
      subject: typeof draft.subject === 'string' ? draft.subject : '',
      requestedDiscountPercent: Number(draft.requestedDiscountPercent || 0),
      confidenceScore: Number(draft.confidenceScore || 0),
      proposedValue: Number(draft.requestedDiscountPercent || 0),
    };

    await this.approvalQueueService.create(tenantId, {
      agentRunId: runId,
      agentType: 'negotiation',
      stepNumber: 1,
      payload,
      reasoning:
        typeof draft.reasoning === 'string'
          ? draft.reasoning
          : 'Negotiation Agent drafted an email to the vendor requesting better terms.',
    });

    await this.agentRunService.appendStep(
      tenantId,
      runId,
      { input: 'Negotiation workflow', kbContext },
      { result: payload },
      'Vendor negotiation email drafted and submitted for approval',
    );
    await this.agentRunService.updateStatus(tenantId, runId, 'awaiting_approval');
    this.logger.log(`Negotiation agent completed; approval submitted for run ${runId}.`);
  }

  private async runGeneric(
    tenantId: string,
    run: any,
    runId: string,
    agentType: AgentType,
  ): Promise<void> {
    const instructions: Record<string, string> = {
      anomaly:
        'You are an inventory anomaly detection assistant. Review the provided context for suspicious stock patterns and summarize your findings concisely.',
      forecasting:
        'You are a demand forecasting assistant. Analyze the provided historical stock movement data and project future demand concisely.',
    };

    const systemPrompt =
      instructions[agentType] ?? 'You are an inventory assistant. Respond concisely.';

    const raw = await this.gatewayLlm.chat(
      systemPrompt,
      JSON.stringify({
        runId,
        skuIds: run.skuIds ?? [],
        vendorId: run.relatedVendorId ?? null,
      }),
    );

    await this.agentRunService.appendStep(
      tenantId,
      runId,
      { input: `${agentType} workflow` },
      { result: raw },
      'Agent executed via gateway',
    );
    await this.agentRunService.updateStatus(tenantId, runId, 'completed');
  }

  private stripFences(text: string): string {
    return text
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```\s*$/g, '')
      .trim();
  }

  private async resolveVendorId(run: any): Promise<string | null> {
    if (run.relatedVendorId) return run.relatedVendorId;
    const skuIds: string[] = run.skuIds ?? [];
    if (skuIds.length === 0) return null;
    try {
      const row = await this.dataSource
        .getRepository(Sku)
        .createQueryBuilder('sku')
        .select('sku.preferredVendorId', 'preferredVendorId')
        .where('sku.id = :id', { id: skuIds[0] })
        .getRawOne();
      return row?.preferredVendorId ?? null;
    } catch (err) {
      this.logger.warn(`Failed to resolve vendor for SKU: ${(err as Error).message}`);
      return null;
    }
  }
}