import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { KnowledgeSourceType } from '../entities/knowledge-chunk.entity';

export class IngestKnowledgeChunkDto {
  @ApiProperty({
    example:
      'VendorCo agrees to supply Product X at $9.00/unit with 7-day lead time...',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;

  @ApiProperty({ enum: KnowledgeSourceType })
  @IsEnum(KnowledgeSourceType)
  sourceType!: KnowledgeSourceType;

  @ApiPropertyOptional({ description: 'Vendor UUID this chunk belongs to' })
  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({ description: 'SKU UUID this chunk belongs to' })
  @IsUUID()
  @IsOptional()
  skuId?: string;
}

export class SearchKnowledgeChunkDto {
  @ApiProperty({ example: 'what price did we agree with VendorCo?' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  query!: string;

  @ApiPropertyOptional({ description: 'Filter results to a specific vendor' })
  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({ enum: KnowledgeSourceType })
  @IsEnum(KnowledgeSourceType)
  @IsOptional()
  sourceType?: KnowledgeSourceType;

  @ApiPropertyOptional({ example: 5, description: 'Max results to return (1-20)' })
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  topK?: number;
}

export class AskAssistantDto {
  @ApiProperty({ example: 'What is our usual price for widgets from VendorCo?' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  query!: string;

  @ApiPropertyOptional({ description: 'Filter context to a specific vendor' })
  @IsUUID()
  @IsOptional()
  vendorId?: string;
}
