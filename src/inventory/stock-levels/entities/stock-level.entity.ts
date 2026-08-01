import { Column, Entity, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { AbstractTenantEntity } from '../../../shared/tenant.entity';
import { Sku } from '../../../sku/entities/sku.entity';
import { Warehouse } from '../../../warehouses/entities/warehouse.entity';

@Unique('uq_stock_levels_sku_warehouse', ['skuId', 'warehouseId'])
@Entity('stock_levels')
export class StockLevel extends AbstractTenantEntity {
  @ManyToOne(() => Sku, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'sku_id' })
  sku!: Sku;

  @Index('idx_stock_levels_sku')
  @Column({ name: 'sku_id', type: 'uuid' })
  skuId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Index('idx_stock_levels_warehouse')
  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId!: string;

  @Column('int', { default: 0 })
  quantity!: number;

  @Column('int', { default: 0 })
  reorderThreshold!: number;

  @Column('int', { default: 0 })
  safetyStock!: number;
}
