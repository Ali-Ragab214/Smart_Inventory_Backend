import { IsBooleanString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../utils/query.dto';
import { NotificationType } from '../entities/notification.entity';

export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(Object.values(NotificationType))
  type?: NotificationType;

  @IsOptional()
  @IsBooleanString()
  isRead?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
