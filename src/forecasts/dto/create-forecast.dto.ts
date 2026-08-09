import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForecastDto {
  @ApiPropertyOptional({ description: 'Target period label, e.g. next-30-days' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  projectedDemand?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  confidenceScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  reasoning?: Record<string, unknown>;
}