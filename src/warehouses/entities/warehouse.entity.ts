import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';
import { User } from '../../users/entities/user.entity';

export enum WarehouseStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('warehouses')
export class Warehouse extends AbstractTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({
    type: 'enum',
    enum: WarehouseStatus,
    default: WarehouseStatus.ACTIVE,
  })
  status!: WarehouseStatus;

  // Removed tenant relation to User, as it is now inherited from AbstractTenantEntity

  @Column({ name: 'is_main', type: 'boolean', default: false })
  isMain!: boolean;

  @Column({ name: 'capacity_units', type: 'int', nullable: true })
  capacityUnits!: number | null;

  /** Annual cost of holding inventory, as a % of SKU cost (default 25%/yr). */
  @Column({ name: 'holding_cost_pct', type: 'int', default: 25 })
  holdingCostPercent!: number;
}
