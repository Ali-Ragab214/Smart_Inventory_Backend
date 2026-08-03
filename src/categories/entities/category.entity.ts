import { Column, Entity, Index } from 'typeorm';
import { AbstractTenantEntity } from '../../shared/tenant.entity';

@Entity('categories')
export class Category extends AbstractTenantEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}
