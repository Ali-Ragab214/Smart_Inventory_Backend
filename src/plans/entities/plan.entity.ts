import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('plans')
export class Plan extends AbstractEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string; // 'Starter', 'Pro', 'Enterprise'

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price!: number | null; // null for custom pricing

  @Column({ type: 'varchar', length: 50, default: 'monthly' })
  billingCycle!: string; // 'monthly' or 'yearly'

  @Column({ type: 'boolean', default: false })
  isPopular!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  features!: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeProductId!: string | null;

  @OneToMany(() => Tenant, (tenant) => tenant.plan)
  tenants!: Tenant[];
}
