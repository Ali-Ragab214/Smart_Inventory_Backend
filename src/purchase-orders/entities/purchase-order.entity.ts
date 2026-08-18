import { Column, Entity, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { PurchaseOrderLineItem } from './purchase-order-line-item.entity';

@Entity('purchase_orders')
export class PurchaseOrder extends AbstractTenantEntity {
  @Column('uuid')
  vendorId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Index('idx_purchase_orders_warehouse')
  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId!: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'pending_approval', 'approved', 'sent', 'received', 'rejected'],
    default: 'draft',
  })
  status!: string;

  @Column({ default: 'manual' })
  createdBy!: string;

  @Column('uuid', { nullable: true })
  negotiationRunId!: string | null;

  @Index('idx_purchase_orders_approval')
  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId!: string | null;

  @OneToMany(() => PurchaseOrderLineItem, (lineItem) => lineItem.purchaseOrder, { cascade: true })
  lineItems!: PurchaseOrderLineItem[];

  @Column({ name: 'receipt_rating', type: 'int', nullable: true })
  receiptRating!: number | null;

  @Column({ name: 'damaged_units', type: 'int', nullable: true })
  damagedUnits!: number | null;
}
