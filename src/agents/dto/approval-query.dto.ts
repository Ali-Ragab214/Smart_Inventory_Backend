import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../utils/query.dto';

export class ApprovalQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;

  @IsOptional()
  @IsIn(['reorder', 'negotiation'])
  agentType?: 'reorder' | 'negotiation';
}
