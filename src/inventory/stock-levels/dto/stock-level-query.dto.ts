import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../utils/query.dto';

export class StockLevelQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
