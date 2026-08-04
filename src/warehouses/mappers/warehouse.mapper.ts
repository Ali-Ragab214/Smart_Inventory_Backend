import { Injectable } from '@nestjs/common';
import { Warehouse } from '../entities/warehouse.entity';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { WarehouseResponseDto } from '../dto/warehouse-response.dto';

@Injectable()
export class WarehouseMapper {
  toEntity(dto: CreateWarehouseDto): Warehouse {
    const warehouse = new Warehouse();
    warehouse.name = dto.name;
    warehouse.location = dto.location ?? null;
    warehouse.status = dto.status ?? undefined as any;
    warehouse.isMain = dto.isMain ?? false;
    if (dto.tenantId) {
      warehouse.tenantId = dto.tenantId;
    }
    return warehouse;
  }

  toResponse(entity: Warehouse): WarehouseResponseDto {
    const dto = new WarehouseResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.location = entity.location ?? null;
    dto.status = entity.status;
    dto.tenantId = entity.tenantId;
    dto.isMain = entity.isMain;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: Warehouse[]): WarehouseResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }

  updateEntity(entity: Warehouse, dto: UpdateWarehouseDto): Warehouse {
    if (dto.name !== undefined) {
      entity.name = dto.name;
    }
    if (dto.location !== undefined) {
      entity.location = dto.location ?? null;
    }
    if (dto.status !== undefined) {
      entity.status = dto.status as any;
    }
    return entity;
  }
}
