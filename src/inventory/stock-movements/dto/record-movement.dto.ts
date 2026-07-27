import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementReason } from '../enums/movement-reason.enum';

export class RecordMovementDto {
  @ApiProperty({ description: 'SKU being moved' })
  @IsUUID()
  @IsNotEmpty()
  skuId!: string;

  @ApiProperty({ description: 'Warehouse where the movement occurs' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId!: string;

  @ApiProperty({ description: 'Quantity change (positive = in, negative = out)', example: 50 })
  @IsInt()
  quantityChange!: number;

  @ApiProperty({ enum: MovementReason })
  @IsEnum(MovementReason)
  reason!: MovementReason;

  @ApiPropertyOptional({ description: 'Caller-supplied unique key for idempotency' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  performedByUserId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceId?: string;
}