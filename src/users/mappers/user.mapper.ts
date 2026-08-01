import { Injectable } from '@nestjs/common';
import { User, UserRole } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';

@Injectable()
export class UserMapper {
  toEntity(dto: CreateUserDto): User {
    const user = new User();
    user.name = dto.name?.trim() ?? '';
    user.email = dto.email.toLowerCase().trim();
    user.username = dto.username.trim();
    user.passwordHash = dto.password; // raw — hashed by @BeforeInsert hook on entity
    user.role = dto.role ?? UserRole.TENANT_OWNER;
    user.isActive = true;
    user.warehouseId = dto.warehouseId ?? null;
    return user;
  }

  toResponse(entity: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.email = entity.email;
    dto.username = entity.username;
    dto.role = entity.role;
    dto.isActive = entity.isActive;
    dto.tenantId = entity.tenantId;
    dto.warehouseId = entity.warehouseId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: User[]): UserResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }
}
