import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewAnomalyFlagDto {
  @ApiProperty()
  @IsUUID()
  reviewedBy!: string;
}
