import {
  Column,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';
import { Category } from '../../categories/entities/category.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

/**
 * Sku database entity representing unique product variants.
 */
@Entity('skus')
export class Sku extends AbstractTenantEntity {
  @Index({ unique: true })
  @Column({ length: 100 })
  sku!: string;

  @Column({ length: 255 })
  name!: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category!: Category | null;

  @Index('idx_skus_category')
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  @Column('numeric', {
    precision: 12,
    scale: 4,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  cost!: number;

  @Column('numeric', {
    precision: 12,
    scale: 4,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  price!: number;

  @ManyToOne(() => Vendor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'preferred_vendor_id' })
  preferredVendor!: Vendor | null;

  @Index('idx_skus_preferred_vendor')
  @Column({ name: 'preferred_vendor_id', type: 'uuid', nullable: true })
  preferredVendorId!: string | null;
}
