import { Column, Entity, Index } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

export type ForecastModel = 'moving_avg' | 'exponential_smoothing' | 'llm';

@Entity('forecasts')
export class Forecast extends AbstractTenantEntity {
  @Index('idx_forecasts_sku')
  @Column('uuid')
  skuId!: string;

  @Column({ type: 'timestamptz' })
  periodStart!: Date;

  @Column({ type: 'timestamptz' })
  periodEnd!: Date;

  @Column('double precision')
  projectedDemand!: number;

  @Column('double precision')
  confidenceScore!: number;

  @Column({
    type: 'enum',
    enum: ['moving_avg', 'exponential_smoothing', 'llm'],
    default: 'llm',
  })
  model!: string;

  @Column({ type: 'jsonb', nullable: true })
  reasoning!: object | null;
}