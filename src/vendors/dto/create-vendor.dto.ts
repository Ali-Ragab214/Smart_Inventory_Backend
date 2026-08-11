import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorTier } from '../entities/vendor.entity';

export class CreateVendorDto {
  @ApiProperty({ example: 'Acme Supplies' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({ example: 'sales@acme.com' })
  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+20 100 000 0000' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'tier1 = strategic/bulk-only partner · tier2 = standard · tier3 = commodity',
    enum: VendorTier,
    example: VendorTier.TIER_2,
  })
  @IsOptional()
  @IsIn(Object.values(VendorTier))
  tier?: VendorTier;
}
