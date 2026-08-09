import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentRunService, AgentType } from './agent-run.service';
import { ApprovalQueueService } from './approval-queue.service';
import { RagService, SearchResult } from '../rag/rag.service';
import { StockLevel } from '../inventory/stock-levels/entities/stock-level.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Sku } from '../sku/entities/sku.entity';
import { ToolExecutorService } from './tool-executor.service';
import { InventoryService } from './inventory.service';
import { MastraService, AgentName } from './mastra.service';
import { ReorderDecisionSchema, NegotiationDecisionSchema, ForecastDecisionSchema } from './agent-ai.schemas';
import { ForecastService } from '../forecasts/forecast.service';

type AgentJobData = {
  runId: string;
  agentType: AgentType;
  tenantId: string;
  draftType?: 'opening' | 'counter';
  counterDiscountPercent?: number;
  vendorReply?: string;
  roundNumber?: number;
  offeredDiscountPercent?: number;
};

@Processor('agent-jobs')
export class AgentsProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentsProcessor.name);

  constructor(
    private readonly mastraService: MastraService,
    private readonly agentRunService: AgentRunService,
    private readonly approvalQueueService: ApprovalQueueService,
    private readonly ragService: RagService,
    private readonly dataSource: DataSource,
    private readonly toolExecutor: ToolExecutorService,
    private readonly inventoryService: InventoryService,
    private readonly forecastService: ForecastService,
  ) {
    super();
  }

  async process(job: Job<AgentJobData>): Promise<void> {
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
        await this.runNegotiation(tenantId, run, runId, job.data);
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

    // Enrich each item with real vendor catalog data (price + lead time) so the
    // agent drafts quantities/prices from actual catalog entries, not guesses.
    const enrichedContext = await Promise.all(
      context.map(async (item) => {
        try {
          const vendors = (await this.toolExecutor.execute(
            tenantId,
            'get_vendors_for_sku',
            { skuId: item.skuId },
          )) as Array<{ vendorId: string; vendorName: string; price: number; leadTimeDays: number }>;
          return { ...item, catalogs: Array.isArray(vendors) ? vendors : [] };
        } catch (err) {
          this.logger.warn(`No catalogs for SKU ${item.skuId}: ${(err as Error).message}`);
          return { ...item, catalogs: [] };
        }
      }),
    );

    const decision = await this.mastraService.runAgent(
      'reorder',
      tenantId,
      JSON.stringify({ lowStockItems: enrichedContext }),
      { runId, maxSteps: 8 },
    );
    const raw = decision.text;

    let draft: Record<string, unknown> = {};
    try {
      const result = JSON.parse(this.stripFences(raw)) as Record<string, unknown>;
      const parsed = ReorderDecisionSchema.parse(result);
      draft = parsed as unknown as Record<string, unknown>;
    } catch {
      try {
        const result = JSON.parse(this.stripFences(raw)) as Record<string, unknown>;
        const parsed = ReorderDecisionSchema.safeParse(result);
        if (parsed.success) {
          draft = parsed.data as unknown as Record<string, unknown>;
        }
      } catch {
        draft = { rawDraft: raw };
      }
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

    // When possible, derive the PO-level vendor from the vendor the agent chose
    // for the majority of drafted items (falls back to run/related or preferred).
    const itemVendors = items
      .map((i) => (i as Record<string, unknown>).vendorId)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    const majorityVendorId = itemVendors.reduce<{ id?: string; count: number }>(
      (acc, id) => {
        const counts = itemVendors.filter((v) => v === id).length;
        return counts > acc.count ? { id, count: counts } : acc;
      },
      { count: 0 },
    ).id;

    const payload = {
      ...draft,
      items: items.map(itemWithWarehouseId),
      proposedValue,
      currency: 'USD',
      vendorId:
        majorityVendorId ??
        (await this.resolveVendorId(run)) ??
        (itemVendors[0] ?? null),
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

  private async runNegotiation(
    tenantId: string,
    run: any,
    runId: string,
    jobData: Partial<AgentJobData> = {},
  ): Promise<void> {
    const vendorId: string | null = await this.resolveVendorId(run);
    const draftType = jobData.draftType ?? 'opening';
    const roundNumber: number = jobData.roundNumber ?? run.roundNumber ?? 1;
    const counterDiscountPercent = jobData.counterDiscountPercent;
    const vendorReply = jobData.vendorReply;

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

    const negotiationPrompt =
      draftType === 'counter'
        ? `Vendor ID: ${vendorId ?? 'unknown'}\nVendor name: ${vendorName ?? 'unknown'}\n\nThis is round ${roundNumber} of negotiation. The vendor rejected our previous offer and replied:\n"${vendorReply ?? ''}"\nTheir counter suggestion is ${counterDiscountPercent ?? 'unknown'}% discount.\n\nKnowledge base context:\n${kbContext}`
        : `Vendor ID: ${vendorId ?? 'unknown'}\nVendor name: ${vendorName ?? 'unknown'}\n\nRound ${roundNumber} — opening offer.\n\nKnowledge base context:\n${kbContext}`;

    const negotiation = await this.mastraService.runAgent(
      'negotiation',
      tenantId,
      negotiationPrompt,
      { runId, maxSteps: 4 },
    );
    const raw = negotiation.text;

    let draft: Record<string, unknown> = {};
    try {
      const result = JSON.parse(this.stripFences(raw)) as Record<string, unknown>;
      const parsed = NegotiationDecisionSchema.parse(result);
      draft = parsed as unknown as Record<string, unknown>;
    } catch {
      try {
        const result = JSON.parse(this.stripFences(raw)) as Record<string, unknown>;
        const parsed = NegotiationDecisionSchema.safeParse(result);
        if (parsed.success) {
          draft = parsed.data as unknown as Record<string, unknown>;
        }
      } catch {
        draft = { emailContent: raw };
      }
    }

    const payload = {
      vendorId,
      emailContent: typeof draft.emailContent === 'string' ? draft.emailContent : '',
      subject: typeof draft.subject === 'string' ? draft.subject : '',
      requestedDiscountPercent: Number(draft.requestedDiscountPercent || 0),
      confidenceScore: Number(draft.confidenceScore || 0),
      proposedValue: Number(draft.requestedDiscountPercent || 0),
      round: roundNumber,
      draftType,
    };

    await this.approvalQueueService.create(tenantId, {
      agentRunId: runId,
      agentType: 'negotiation',
      stepNumber: 1,
      payload,
      reasoning:
        typeof draft.reasoning === 'string'
          ? draft.reasoning
          : draftType === 'counter'
            ? `Round ${roundNumber} counter-proposal drafted after vendor's ${counterDiscountPercent}% counter.`
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
    // Wire the real inventory data into the context so the LLM reasons over true
    // movement history + low-stock levels instead of just ids.
    const skuIds: string[] = (run.skuIds ?? []).slice(0, 6);
    const stockContext: Array<Record<string, unknown>> = [];

    for (const skuId of skuIds) {
      try {
        const sku = await this.inventoryService.findSku(tenantId, skuId);
        const history = await this.inventoryService.getMovementHistory(tenantId, skuId);
        stockContext.push({
          skuId,
          sku: sku?.sku ?? null,
          productName: sku?.name ?? null,
          movementCount: history.length,
          movements: history.slice(0, 30).map((m: any) => ({
            date: m.createdAt ?? m.date ?? null,
            type: m.reason ?? m.movementType ?? null,
            quantityChange: Number(m.quantityChange ?? m.quantity ?? 0),
            reference: m.reference ?? null,
            note: m.note ?? null,
          })),
        });
      } catch (err) {
        this.logger.warn(`Failed to load history for SKU ${skuId}: ${(err as Error).message}`);
      }
    }

    let lowStockContext: unknown[] = [];
    if (agentType === 'anomaly') {
      try {
        const low = await this.inventoryService.findLowStock(tenantId);
        lowStockContext = low.map((sl: any) => ({
          skuId: sl.skuId,
          sku: sl.sku?.sku ?? null,
          productName: sl.sku?.name ?? null,
          warehouse: sl.warehouse?.name ?? null,
          quantity: sl.quantity ?? null,
          reorderThreshold: sl.reorderThreshold ?? null,
        }));
      } catch (err) {
        this.logger.warn(`Failed to load low-stock levels: ${(err as Error).message}`);
      }
    }

    const result = await this.mastraService.runAgent(
      agentType as AgentName,
      tenantId,
      JSON.stringify({
        runId,
        skuIds,
        vendorId: run.relatedVendorId ?? null,
        stock: stockContext,
        lowStock: lowStockContext,
      }),
      { runId, maxSteps: 4 },
    );
    const raw = result.text;

    if (agentType === 'forecasting') {
      await this.persistForecast(tenantId, run, stockContext, raw);
    }

    await this.agentRunService.appendStep(
      tenantId,
      runId,
      { input: `${agentType} workflow` },
      { result: raw },
      'Agent executed via Mastra',
    );
    await this.agentRunService.updateStatus(tenantId, runId, 'completed');
  }

  private stripFences(text: string): string {
    return text
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```\s*$/g, '')
      .trim();
  }

  /**
   * Persist a forecasting outcome for the run's (single) SKU: LLM decision
   * when parseable, otherwise a statistical moving-average fallback.
   */
  private async persistForecast(
    tenantId: string,
    run: any,
    stockContext: Array<Record<string, unknown>>,
    raw: string,
  ): Promise<void> {
    const skuId: string | undefined = (run.skuIds ?? [])[0];
    if (!skuId) return;

    try {
      const result = JSON.parse(this.stripFences(raw)) as Record<string, unknown>;
      const parsed = ForecastDecisionSchema.parse(result);
      await this.forecastService.record(tenantId, skuId, {
        projectedDemand: parsed.projectedDemand,
        confidenceScore: parsed.confidenceScore,
        period: parsed.period,
        reasoning: {
          llm: true,
          rawReasoning: parsed.reasoning,
          source: 'mastra_forecasting_agent',
        },
        model: 'llm',
      });
      return;
    } catch {
      // fall through to statistical fallback
    }

    try {
      const first = stockContext[0] as any;
      const movements: Array<Record<string, unknown>> = first?.movements ?? [];
      const daily = new Map<string, number>();
      for (const m of movements) {
        const rawDate = m.date as string | undefined;
        if (!rawDate) continue;
        const day = String(rawDate).slice(0, 10);
        const change = Number(m.quantityChange ?? 0);
        daily.set(day, (daily.get(day) ?? 0) + Math.max(0, -change || 0));
      }
      const series = [...daily.values()].slice(-90);
      if (series.length === 0) {
        this.logger.warn(`No movement series for SKU ${skuId} — skipping statistical forecast.`);
        return;
      }
      await this.forecastService.recordStatisticalFallback(
        tenantId,
        skuId,
        series,
      );
    } catch (err) {
      this.logger.warn(`Statistical forecast failed for SKU ${skuId}: ${(err as Error).message}`);
    }
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