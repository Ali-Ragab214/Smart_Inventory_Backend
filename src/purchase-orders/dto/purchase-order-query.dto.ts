import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../utils/query.dto';

export class PurchaseOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'pending_approval', 'approved', 'sent', 'received', 'rejected'])
  status?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
