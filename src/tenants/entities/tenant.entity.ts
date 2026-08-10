import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';
import { User } from '../../users/entities/user.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { JoinColumn, ManyToOne } from 'typeorm';

@Entity('tenants')
export class Tenant extends AbstractEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];

  @Column({ type: 'uuid', nullable: true })
  planId!: string | null;

  @ManyToOne(() => Plan, (plan) => plan.tenants, { nullable: true })
  @JoinColumn({ name: 'planId' })
  plan!: Plan | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subscriptionStatus!: string | null; // e.g. 'active', 'past_due', 'canceled', 'trialing'

  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt!: Date | null;
}
