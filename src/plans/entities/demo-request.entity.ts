import { Column, Entity } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';

@Entity('demo_requests')
export class DemoRequest extends AbstractEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'boolean', default: false })
  isContacted!: boolean;
}
