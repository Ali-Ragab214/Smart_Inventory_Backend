import { ApiProperty } from '@nestjs/swagger';
import { WarehouseResponseDto } from './warehouse-response.dto';

export class WarehouseSummaryDto extends WarehouseResponseDto {
  @ApiProperty()
  units!: number;

  @ApiProperty()
  stockValue!: number;

  @ApiProperty()
  targetValue!: number;

  @ApiProperty()
  coveragePct!: number;

  @ApiProperty()
  capacityUsedPct!: number;

  @ApiProperty()
  skuCount!: number;

  @ApiProperty()
  lowStockCount!: number;

  @ApiProperty()
  openOrderCount!: number;

  @ApiProperty()
  staffCount!: number;
}