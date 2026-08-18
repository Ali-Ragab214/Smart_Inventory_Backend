import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseStatus } from '../entities/warehouse.entity';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Main Warehouse' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({ example: 'Cairo, Egypt' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  location?: string;

  @ApiPropertyOptional({ example: WarehouseStatus.ACTIVE, enum: WarehouseStatus })
  @IsEnum(WarehouseStatus)
  @IsOptional()
  status?: WarehouseStatus;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isMain?: boolean;

  @ApiPropertyOptional({ example: 2000, description: 'Total storage capacity in units' })
  @IsInt()
  @Min(0)
  @IsOptional()
  capacityUnits?: number;
}
