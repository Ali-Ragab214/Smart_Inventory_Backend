import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../utils/query.dto';

export class StockLevelQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
