import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../utils/query.dto';

export class VendorCatalogEntryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsUUID()
  skuId?: string;
}
