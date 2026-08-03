import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferStockDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  skuId!: string;

  @ApiProperty({ description: 'Source warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  fromWarehouseId!: string;

  @ApiProperty({ description: 'Destination warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  toWarehouseId!: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
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
}