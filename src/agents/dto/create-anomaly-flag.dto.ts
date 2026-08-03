import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAnomalyFlagDto {
  @ApiProperty()
  @IsUUID()
  skuId!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  relatedMovementIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentRunId?: string;
}
