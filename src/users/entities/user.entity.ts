import { Entity, Column, Index, BeforeInsert, BeforeUpdate, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AbstractEntity } from '../../shared/base.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum UserRole {
  TENANT = 'tenant',
  WAREHOUSE_MANAGER = 'warehouse_manager',
  CLERK = 'clerk',
  SUPER_ADMIN = 'super_admin',
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
  @Column({ type: 'varchar', length: 255, select: false, name: 'password_hash', nullable: true })
  passwordHash!: string | null;

  @Index({ unique: true, sparse: true })
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'google_id' })
  googleId!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.TENANT })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => Warehouse, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse | null;

  @Index('idx_users_warehouse')
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant | null;

  @Index('idx_users_tenant')
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @OneToMany(() => Warehouse, (warehouse) => warehouse.tenant)
  ownedWarehouses!: Warehouse[];

  @Column({ type: 'varchar', length: 255, nullable: true, select: false, name: 'reset_password_token' })
  resetPasswordToken!: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false, name: 'reset_password_expires' })
  resetPasswordExpires!: Date | null;

  /**
   * Hashes the password before any INSERT or UPDATE.
   * Because `passwordHash` has `select: false`, partial updates that do not
   * touch the password field will not have the property set, so no
   * re-hashing will occur.
   */
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.passwordHash && !this.passwordHash.startsWith('$2a$')) {
      this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
    }
  }

  async comparePassword(plain: string): Promise<boolean> {
    if (!this.passwordHash) return false;
    return bcrypt.compare(plain, this.passwordHash);
  }
}
