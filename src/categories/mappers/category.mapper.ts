import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoryResponseDto } from '../dto/category-response.dto';

@Injectable()
export class CategoryMapper {
  toEntity(dto: CreateCategoryDto): Category {
    const category = new Category();
    category.name = dto.name;
    category.description = dto.description ?? null;
    return category;
  }

  toResponse(entity: Category): CategoryResponseDto {
    const dto = new CategoryResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.description = entity.description ?? null;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: Category[]): CategoryResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }

  updateEntity(entity: Category, dto: UpdateCategoryDto): Category {
    if (dto.name !== undefined) {
      entity.name = dto.name;
    }
    if (dto.description !== undefined) {
      entity.description = dto.description ?? null;
    }
    return entity;
  }
}