import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Forecast } from './entities/forecast.entity';
import { CreateForecastDto } from './dto/create-forecast.dto';

export interface ForecastInput {
  projectedDemand: number;
  confidenceScore: number;
  period?: string;
  reasoning?: Record<string, unknown>;
  model?: 'llm' | 'moving_avg' | 'exponential_smoothing';
  periodStart?: Date;
  periodEnd?: Date;
}

@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);

  constructor(
    @InjectRepository(Forecast)
    private readonly forecastRepo: Repository<Forecast>,
  ) {}

  async record(
    tenantId: string,
    skuId: string,
    input: ForecastInput,
    lookbackDays = 90,
  ): Promise<Forecast> {
    const projectedDemand = Math.max(0, Number(input.projectedDemand) || 0);
    const confidenceScore = Math.min(
      100,
      Math.max(0, Number(input.confidenceScore) || 0),
    );

    const period = periodDays(input.period);
    const now = new Date();
    const periodStart = input.periodStart ?? now;
    const periodEnd =
      input.periodEnd ??
      new Date(now.getTime() + period.days * 86400000);

    const entity = this.forecastRepo.create({
      tenantId,
      skuId,
      periodStart,
      periodEnd,
      projectedDemand,
      confidenceScore,
      model: input.model ?? 'llm',
      reasoning: input.reasoning ?? null,
    });
    const saved = await this.forecastRepo.save(entity);
    this.logger.log(
      `Forecast recorded for SKU ${skuId}: ${projectedDemand} units (${input.model ?? 'llm'}, ${confidenceScore}%).`,
    );
    return saved;
  }

  /**
   * Statistical fallback when the LLM output cannot be parsed: 90-day moving
   * average scaled to the target period, with a confidence derived from
   * relative volatility.
   */
  async recordStatisticalFallback(
    tenantId: string,
    skuId: string,
    dailySeries: number[],
    period = 'next-30-days',
  ): Promise<Forecast> {
    const lookback = 90;
    const series = dailySeries.slice(-lookback);
    const avg = series.reduce((a, b) => a + b, 0) / Math.max(1, series.length);

    const target = periodDays(period);
    const projected = Math.round(avg * target.days);
    const std = Math.sqrt(
      series.reduce((a, v) => a + (v - avg) ** 2, 0) / Math.max(1, series.length),
    );
    const cv = avg > 0 ? std / avg : 1;
    const confidence = Math.round(
      Math.min(95, Math.max(20, 85 - cv * 40)),
    );

    return this.record(
      tenantId,
      skuId,
      {
        projectedDemand: projected,
        confidenceScore: confidence,
        period: target.label,
        model: 'moving_avg',
        reasoning: {
          lookbackDays: series.length,
          meanDailyDemand: avg,
          stdDev: std,
          source: 'statistical_fallback',
        },
      },
      lookback,
    );
  }

  async findForSku(
    tenantId: string,
    skuId: string,
    from?: Date,
    to?: Date,
  ) {
    const qb = this.forecastRepo
      .createQueryBuilder('forecast')
      .where('forecast.tenantId = :tenantId', { tenantId })
      .andWhere('forecast.skuId = :skuId', { skuId })
      .orderBy('forecast.periodStart', 'DESC');
    if (from) qb.andWhere('forecast.periodStart >= :from', { from });
    if (to) qb.andWhere('forecast.periodEnd <= :to', { to });
    return qb.getMany();
  }

  async findRecent(tenantId: string, skuIds: string[], limit = 60) {
    if (skuIds.length === 0) return [];
    return this.forecastRepo
      .createQueryBuilder('forecast')
      .where('forecast.tenantId = :tenantId', { tenantId })
      .andWhere('forecast.skuId IN (:...skuIds)', { skuIds: skuIds.slice(0, 200) })
      .orderBy('forecast.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  async findAllByTenant(tenantId: string, limit = 30) {
    return this.forecastRepo
      .createQueryBuilder('forecast')
      .where('forecast.tenantId = :tenantId', { tenantId })
      .orderBy('forecast.periodStart', 'DESC')
      .take(limit)
      .getMany();
  }
}

type PeriodSpec = { days: number; label: string };
const PERIODS: Record<string, PeriodSpec> = {
  'next-7-days': { days: 7, label: 'next-7-days' },
  'next-30-days': { days: 30, label: 'next-30-days' },
  'next-90-days': { days: 90, label: 'next-90-days' },
};

function periodDays(period?: string): PeriodSpec {
  if (period && PERIODS[period]) return PERIODS[period];
  // Try to lerp unknown labels like "next-45-days"
  const match = /(\d+)/.exec(period ?? '');
  if (match) return { days: Math.max(1, Number(match[1])), label: period ?? 'next-30-days' };
  return PERIODS['next-30-days'];
}