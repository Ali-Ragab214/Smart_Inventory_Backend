import { Column, Entity } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

@Entity('vendors')
export class Vendor extends AbstractTenantEntity {
  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  contactPhone!: string | null;
}
