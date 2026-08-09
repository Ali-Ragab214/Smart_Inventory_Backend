import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { Sku } from '../sku/entities/sku.entity';
import { StockMovement } from '../inventory/stock-movements/entities/stock-movement.entity';
import { AgentRunService, AgentType } from '../agents/agent-run.service';

const TOP_MOVERS_PER_TENANT = 20;
const LOOKBACK_DAYS = 60;

@Injectable()
export class ForecastSchedulerService {
  private readonly logger = new Logger(ForecastSchedulerService.name);

  constructor(
    @InjectRepository(Sku)
    private readonly skuRepo: Repository<Sku>,
    private readonly dataSource: DataSource,
    private readonly agentRunService: AgentRunService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'forecast-daily-run' })
  async handleDailyForecast() {
    this.logger.log('Daily forecast cron fired — queuing forecasts for all tenants.');
    await this.triggerAll();
  }

  /** Queue one forecasting run per top-mover SKU per tenant (manual or cron). */
  async triggerAll(): Promise<number> {
    let queued = 0;
    try {
      const tenantIds = await this.skuRepo
        .createQueryBuilder('sku')
        .select('DISTINCT sku.tenantId', 'tenantId')
        .getRawMany<{ tenantId: string }>();

      for (const { tenantId } of tenantIds) {
        queued += await this.triggerForTenant(tenantId);
      }
    } catch (err) {
      this.logger.error(`Forecast trigger failed: ${(err as Error).message}`, (err as Error).stack);
    }
    return queued;
  }

  async triggerForTenant(tenantId: string): Promise<number> {
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);

      const top = await this.dataSource
        .getRepository(StockMovement)
        .createQueryBuilder('m')
        .select('m."sku_id"', 'skuId')
        .addSelect(
          'SUM(CASE WHEN m."quantity_change" < 0 THEN -m."quantity_change" ELSE 0 END)',
          'demand',
        )
        .where('m."tenant_id" = :tenantId', { tenantId })
        .andWhere('m."created_at" >= :since', { since })
        .groupBy('m."sku_id"')
        .orderBy('demand', 'DESC')
        .limit(TOP_MOVERS_PER_TENANT)
        .getRawMany()
        .catch(() => []);

      let skuIds: string[];
      if (top.length > 0) {
        skuIds = top
          .map((r) => r.skuId as string)
          .filter((id): id is string => !!id);
      } else {
        const fallback = await this.skuRepo.find({
          where: { tenantId },
          take: TOP_MOVERS_PER_TENANT,
        });
        skuIds = fallback.map((s) => s.id);
      }

      let queued = 0;
      for (const skuId of skuIds) {
        const result = await this.agentRunService.start(tenantId, 'forecasting', {
          skuIds: [skuId],
        });
        const runId = (result as any).data?.id ?? (result as any).id;
        await this.agentRunService.enqueue(tenantId, runId, 'forecasting');
        queued += 1;
      }
      this.logger.log(`Queued ${queued} forecasting run(s) for tenant ${tenantId}.`);
      return queued;
    } catch (err) {
      this.logger.error(`Forecast trigger failed for tenant ${tenantId}: ${(err as Error).message}`);
      return 0;
    }
  }
}