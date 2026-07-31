import {
  Column,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AbstractTenantEntity } from '../../../shared/tenant.entity';
import { Sku } from '../../../sku/entities/sku.entity';
import { User } from '../../../users/entities/user.entity';
import { Warehouse } from '../../../warehouses/entities/warehouse.entity';
import { MovementReason } from '../enums/movement-reason.enum';


@Entity('stock_movements')
@Index('idx_stock_movements_sku_created', ['skuId', 'createdAt'])
@Index('idx_stock_movements_created', ['createdAt'])
export class StockMovement extends AbstractTenantEntity {
  // ── Relations ────────────────────────────────────────────────────────────
  @ManyToOne(() => Sku, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'sku_id' })
  sku!: Sku;

  @Column({ name: 'sku_id', type: 'uuid' })
  skuId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Index('idx_stock_movements_warehouse')
  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'performed_by' })
  performedBy!: User | null;

  // ── Core movement fields ─────────────────────────────────────────────────
  @Column({ type: 'enum', enum: MovementReason })
  reason!: MovementReason;

  /**
   * Positive = stock in (receipt, return, …).
   * Negative = stock out (sale, write-off, …).
   */
  @Column({ type: 'int' })
  quantityChange!: number;

  /** Snapshot of stock AFTER this movement was applied (internal audit). */
  @Column({ type: 'int' })
  balanceAfter!: number;

  // ── Attribution ───────────────────────────────────────────────────────────
  /** User UUID who performed this movement (denormalized for fast query). */
  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedByUserId!: string | null;

  /** E.g. 'reorder_agent', 'negotiation_agent' — for future agent integration. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  performedByAgent!: string | null;

  // ── Traceability ──────────────────────────────────────────────────────────
  /** E.g. 'purchase_order', 'manual_adjustment' */
  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceType!: string | null;

  /** ID of the PO / adjustment / etc. that caused this movement. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  referenceId!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  // ── Idempotency ───────────────────────────────────────────────────────────
  /**
   * Caller-supplied key that uniquely identifies the logical operation.
   * UNIQUE constraint guarantees concurrent retries produce exactly
   * one row. NOT exposed in response DTOs — internal concern only.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;
}
