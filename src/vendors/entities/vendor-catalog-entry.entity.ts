import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';
import { Vendor } from './vendor.entity';

@Entity('vendor_catalog_entries')
export class VendorCatalogEntry extends AbstractEntity {
  @Column('uuid')
  vendorId!: string;

  @ManyToOne(() => Vendor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendorId' })
  vendor!: Vendor;

  @Column('uuid')
  skuId!: string;

  @Column('numeric', {
    precision: 12,
    scale: 4,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  price!: number;

  @Column('int')
  leadTimeDays!: number;
}
