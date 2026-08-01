import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from './base.entity';
import type { Tenant } from '../tenants/entities/tenant.entity';

export abstract class AbstractTenantEntity extends AbstractEntity {
  @ManyToOne('Tenant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
}
