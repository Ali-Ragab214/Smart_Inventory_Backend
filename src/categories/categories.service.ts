import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CategoryMapper } from './mappers/category.mapper';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly categoryMapper: CategoryMapper,
  ) {}

  async create(tenantId: string, dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const category = this.categoryMapper.toEntity(dto);
    category.tenantId = tenantId;
    const saved = await this.categoryRepository.save(category);
    return this.categoryMapper.toResponse(saved);
  }

  async findAll(tenantId: string): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({ where: { tenantId } });
    return this.categoryMapper.toResponseList(categories);
  }

  async findOne(tenantId: string, id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException({ message: 'The specified category could not be found.', code: 'CATEGORY_NOT_FOUND' });
    }
    return this.categoryMapper.toResponse(category);
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException({ message: 'The specified category could not be found.', code: 'CATEGORY_NOT_FOUND' });
    }
    const updated = this.categoryMapper.updateEntity(category, dto);
    const saved = await this.categoryRepository.save(updated);
    return this.categoryMapper.toResponse(saved);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException({ message: 'The specified category could not be found.', code: 'CATEGORY_NOT_FOUND' });
    }
    await this.categoryRepository.softRemove(category);
  }
}