import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';
import { User } from '../../users/entities/user.entity';

export enum WarehouseStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('warehouses')
export class Warehouse extends AbstractEntity {
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

  @ManyToOne(() => User, (user) => user.ownedWarehouses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: User;

  @Index('idx_warehouses_tenant')
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string;

  @Column({ name: 'is_main', type: 'boolean', default: false })
  isMain!: boolean;
}
