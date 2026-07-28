import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../utils/query.dto';

export class AnomalyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['flagged', 'reviewed', 'escalated'] })
  @IsOptional()
  @IsIn(['flagged', 'reviewed', 'escalated'])
  status?: 'flagged' | 'reviewed' | 'escalated';
}
