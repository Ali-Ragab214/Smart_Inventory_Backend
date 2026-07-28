import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVendorCatalogEntryDto {
  @ApiProperty({ description: 'SKU UUID' })
  @IsUUID()
  @IsNotEmpty()
  skuId!: string;

  @ApiProperty({ example: 12.50, description: 'Price for this SKU from this vendor' })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 7, description: 'Lead time in days' })
  @IsInt()
  @IsOptional()
  @Min(0)
  leadTimeDays?: number;
}
