import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../utils/query.dto';

export class ApprovalQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsIn(['reorder', 'negotiation'])
  agentType?: 'reorder' | 'negotiation';
}
