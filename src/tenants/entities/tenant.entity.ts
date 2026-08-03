import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('tenants')
export class Tenant extends AbstractEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];
}
