import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';
import { Sku } from '../../sku/entities/sku.entity';

@Entity('agent_runs')
export class AgentRun extends AbstractTenantEntity {
  @Column({
    type: 'enum',
    enum: ['forecasting', 'reorder', 'negotiation', 'anomaly'],
  })
  agentType!: string;

  @Column({
    type: 'enum',
    enum: ['in_progress', 'awaiting_approval', 'completed', 'rejected', 'escalated'],
    default: 'in_progress',
  })
  status!: string;

  @ManyToMany(() => Sku)
  @JoinTable({
    name: 'agent_run_skus',
    joinColumn: { name: 'agent_run_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'sku_id', referencedColumnName: 'id' },
  })
  skus!: Sku[];

  @Column('uuid', { nullable: true })
  relatedVendorId!: string | null;

  @Column('uuid', { nullable: true })
  relatedPoId!: string | null;

  @Column('uuid', { nullable: true })
  contextRunId!: string | null;
}
