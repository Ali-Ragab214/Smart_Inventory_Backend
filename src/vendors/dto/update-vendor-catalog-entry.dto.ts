import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateVendorCatalogEntryDto {
  @ApiPropertyOptional({ example: 11.75, description: 'Updated price' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 5, description: 'Updated lead time in days' })
  @IsInt()
  @IsOptional()
  @Min(0)
  leadTimeDays?: number;
}
