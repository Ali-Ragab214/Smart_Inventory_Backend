import { ApiProperty } from '@nestjs/swagger';

export class WarehouseResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  location!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  isMain!: boolean;

  @ApiProperty({ nullable: true })
  capacityUnits!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
