import { Column, Entity, Index } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

@Entity('categories')
@Index(['name', 'tenantId'], { unique: true })
export class Category extends AbstractTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}
