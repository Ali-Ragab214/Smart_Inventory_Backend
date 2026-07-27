import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStockLevelDto {
  @ApiPropertyOptional({
    description: 'Quantity below which a reorder should be triggered',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderThreshold?: number;

  @ApiPropertyOptional({
    description: 'Minimum buffer stock to keep on hand',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStock?: number;
}
