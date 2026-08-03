import { ApiProperty } from '@nestjs/swagger';

export class VendorCatalogEntryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  vendorId!: string;

  @ApiProperty()
  skuId!: string;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  leadTimeDays!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
