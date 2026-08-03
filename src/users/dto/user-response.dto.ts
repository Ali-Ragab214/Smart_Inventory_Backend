import { UserRole } from '../entities/user.entity';

export class UserResponseDto {
  id!: string;
  name!: string | null;
  phone!: string | null;
  avatarUrl!: string | null;
  location!: string | null;
  bio!: string | null;
  email!: string;
  username!: string;
  role!: UserRole;
  isActive!: boolean;
  tenantId!: string | null;
  warehouseId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
