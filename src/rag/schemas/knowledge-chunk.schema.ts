import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
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
