import { Column, Entity, Index } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

export enum NotificationType {
  APPROVAL_REQUESTED = 'approval.requested',
  LOW_STOCK_DETECTED = 'lowstock.detected',
  PO_RECEIVED = 'po.received',
  PO_CREATED = 'po.created',
  VENDOR_RESPONDED = 'vendor.responded',
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

@Entity('notifications')
export class Notification extends AbstractTenantEntity {
  @Index('idx_notifications_user')
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Index('idx_notifications_warehouse')
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @Index('idx_notifications_type')
  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: {} })
  data!: object;

  @Column({
    type: 'enum',
    enum: NotificationSeverity,
    default: NotificationSeverity.INFO,
  })
  severity!: NotificationSeverity;

  @Index('idx_notifications_read')
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
