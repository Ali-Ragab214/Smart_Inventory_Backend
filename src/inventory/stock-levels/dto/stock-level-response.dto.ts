import { ApiProperty } from '@nestjs/swagger';

export class StockLevelResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  skuId!: string;

  @ApiProperty({ description: 'Human-readable SKU name' })
  skuName!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiProperty({ description: 'Human-readable warehouse name' })
  warehouseName!: string;

  @ApiProperty({ description: 'Warehouse city/location (e.g. Alexandria)' })
  warehouseLocation!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  reorderThreshold!: number;

  @ApiProperty()
  safetyStock!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
