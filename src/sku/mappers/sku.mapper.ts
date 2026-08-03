import { Injectable } from '@nestjs/common';
import { Sku } from '../entities/sku.entity';
import { CreateSkuDto } from '../dto/create-sku.dto';
import { UpdateSkuDto } from '../dto/update-sku.dto';
import { SkuResponseDto } from '../dto/sku-response.dto';

@Injectable()
export class SkuMapper {
  toEntity(createDto: CreateSkuDto): Sku {
    const entity = new Sku();
    entity.sku = createDto.sku;
    entity.name = createDto.name;
    entity.categoryId = createDto.categoryId ?? null;
    entity.cost = createDto.cost;
    entity.price = createDto.price;
    entity.preferredVendorId = createDto.preferredVendorId ?? null;
    return entity;
  }

  toResponse(entity: Sku): SkuResponseDto {
    const dto = new SkuResponseDto();
    dto.id = entity.id;
    dto.sku = entity.sku;
    dto.name = entity.name;
    dto.categoryId = entity.categoryId ?? null;
    dto.cost = entity.cost;
    dto.price = entity.price;
    dto.preferredVendorId = entity.preferredVendorId ?? null;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: Sku[]): SkuResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }

  updateEntity(entity: Sku, dto: UpdateSkuDto): Sku {
    if (dto.sku !== undefined) {
      entity.sku = dto.sku;
    }
    if (dto.name !== undefined) {
      entity.name = dto.name;
    }
    if (dto.categoryId !== undefined) {
      entity.categoryId = dto.categoryId ?? null;
    }
    if (dto.cost !== undefined) {
      entity.cost = dto.cost;
    }
    if (dto.price !== undefined) {
      entity.price = dto.price;
    }
    if (dto.preferredVendorId !== undefined) {
      entity.preferredVendorId = dto.preferredVendorId ?? null;
    }
    return entity;
  }
}
