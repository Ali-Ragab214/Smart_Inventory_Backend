import { IsString, IsNotEmpty, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const VALID_STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'received', 'rejected'] as const;

export class TransitionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_STATUSES, { message: 'Invalid target status' })
  status!: string;

  @ApiPropertyOptional({ description: 'Human 1-5 star delivery rating captured at receive time', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingStars?: number;

  @ApiPropertyOptional({ description: 'Number of units received damaged in this delivery', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  damagedUnits?: number;
}