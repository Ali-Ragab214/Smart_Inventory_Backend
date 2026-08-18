import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../utils/query.dto';

export class SkuQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'name';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
