import { Column, Entity } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

@Entity('approval_requests')
export class ApprovalRequest extends AbstractTenantEntity {
  @Column('uuid')
  agentRunId!: string;

  @Column({
    type: 'enum',
    enum: ['reorder', 'negotiation'],
  })
  agentType!: string;

  @Column('int')
  stepNumber!: number;

  @Column({ type: 'jsonb' })
  payload!: object;

  @Column({ type: 'text', nullable: true })
  reasoning!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'deferred'],
    default: 'pending',
  })
  status!: string;

  @Column('uuid', { nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;
}
