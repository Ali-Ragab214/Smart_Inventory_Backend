import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({ example: 'Electronics' })
  name?: string;

  @ApiPropertyOptional({ example: 'Electronic devices and accessories' })
  description?: string;
}