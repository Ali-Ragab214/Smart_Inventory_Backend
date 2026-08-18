import { Column, Entity, Index, Unique } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

@Entity('vendor_negotiation_profiles')
@Unique(['vendorId'])
export class VendorNegotiationProfile extends AbstractTenantEntity {
  @Index()
  @Column('uuid')
  vendorId!: string;

  /** Minimum discount percent the simulated vendor is willing to accept. */
  @Column('double precision', { default: 8 })
  acceptMinimumDiscountPercent!: number;

  /** How aggressively the vendor counters (percentage points above our offer). */
  @Column('double precision', { default: 2 })
  counterIncrementPercent!: number;

  /** Hard cap the vendor will never move beyond. */
  @Column('double precision', { default: 10 })
  maxDiscountPercent!: number;

  /** True = tough negotiator (higher acceptance floor, slower increments). */
  @Column({ default: false })
  hardNegotiates!: boolean;
}