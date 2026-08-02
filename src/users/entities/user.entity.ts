import { Entity, Column, Index, BeforeInsert, BeforeUpdate, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AbstractEntity } from '../../shared/base.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  TENANT_OWNER = 'tenant_owner',
  WAREHOUSE_MANAGER = 'warehouse_manager',
  BRANCH_MANAGER = 'branch_manager',
  INVENTORY_CLERK = 'inventory_clerk',
}

@Entity('users')
export class User extends AbstractEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  username!: string;

  /**
   * Password hash is excluded from SELECT by default.
   * Use createQueryBuilder().addSelect('user.passwordHash') when it is needed (auth flows only).
   */
  @Column({ type: 'varchar', length: 255, select: false, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.TENANT_OWNER })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => Warehouse, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse | null;

  @Index('idx_users_warehouse')
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @OneToMany(() => Warehouse, (warehouse) => warehouse.tenant)
  ownedWarehouses!: Warehouse[];

  /**
   * Hashes the password before any INSERT or UPDATE.
   * Because `passwordHash` has `select: false`, partial updates that do not
   * touch the password field will not have the property set, so no
   * re-hashing will occur.
   */
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.passwordHash) {
      this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
    }
  }

  async comparePassword(plain: string): Promise<boolean> {
    return bcrypt.compare(plain, this.passwordHash);
  }
}
