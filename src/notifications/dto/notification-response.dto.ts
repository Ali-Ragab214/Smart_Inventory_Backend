import {
  NotificationSeverity,
  NotificationType,
} from '../entities/notification.entity';

export class NotificationResponseDto {
  id!: string;
  type!: NotificationType;
  title!: string;
  message!: string;
  data!: object;
  severity!: NotificationSeverity;
  userId!: string | null;
  warehouseId!: string | null;
  isRead!: boolean;
  readAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
