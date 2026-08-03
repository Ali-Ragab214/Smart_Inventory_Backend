import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseStatus } from '../entities/warehouse.entity';
import { CreateWarehouseDto } from './create-warehouse.dto';

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {
  @ApiPropertyOptional({ example: 'Main Warehouse' })
  name?: string;

  @ApiPropertyOptional({ example: 'Cairo, Egypt' })
  location?: string;

  @ApiPropertyOptional({ example: WarehouseStatus.ACTIVE, enum: WarehouseStatus })
  status?: WarehouseStatus;
}
