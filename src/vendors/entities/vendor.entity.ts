import { Column, Entity } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

export enum VendorTier {
  TIER_1 = 'tier1',
  TIER_2 = 'tier2',
  TIER_3 = 'tier3',
}

@Entity('vendors')
export class Vendor extends AbstractTenantEntity {
  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  contactPhone!: string | null;

  /** tier1 = strategic/bulk-only partner · tier2 = standard · tier3 = commodity/harder terms */
  @Column({ type: 'enum', enum: VendorTier, default: VendorTier.TIER_2 })
  tier!: VendorTier;
}