import { ApiProperty } from '@nestjs/swagger';
import { VendorTier } from '../entities/vendor.entity';

export class VendorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ enum: VendorTier, example: VendorTier.TIER_2 })
  tier!: VendorTier;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
