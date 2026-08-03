import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';
import { User } from '../../users/entities/user.entity';

@Entity('anomaly_flags')
export class AnomalyFlag extends AbstractTenantEntity {
  @Column('uuid', { nullable: true })
  agentRunId!: string | null;

  @Column('uuid')
  skuId!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column('uuid', { array: true, default: [] })
  relatedMovementIds!: string[];

  @Column({
    type: 'enum',
    enum: ['flagged', 'reviewed', 'escalated'],
    default: 'flagged',
  })
  status!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer!: User | null;

  @Column('uuid', { nullable: true, name: 'reviewed_by' })
  reviewedBy!: string | null;
}
