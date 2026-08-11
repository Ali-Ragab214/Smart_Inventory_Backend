import { Column, Entity } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

/**
 * Marketing/promotion window that the Forecasting Agent can see so demand
 * projections account for artificial spikes (campaigns, Black Friday, etc.).
 */
@Entity('campaigns')
export class Campaign extends AbstractTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  skuIds!: string[];

  @Column({ type: 'timestamptz' })
  startDate!: Date;

  @Column({ type: 'timestamptz' })
  endDate!: Date;

  @Column('numeric', {
    precision: 8,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  expectedDemandMultiplier!: number;
}