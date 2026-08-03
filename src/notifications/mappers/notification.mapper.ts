import { Injectable } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';
import { NotificationResponseDto } from '../dto/notification-response.dto';

@Injectable()
export class NotificationMapper {
  toResponse(notification: Notification): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = notification.id;
    dto.type = notification.type;
    dto.title = notification.title;
    dto.message = notification.message;
    dto.data = notification.data;
    dto.severity = notification.severity;
    dto.userId = notification.userId;
    dto.warehouseId = notification.warehouseId;
    dto.isRead = notification.isRead;
    dto.readAt = notification.readAt;
    dto.createdAt = notification.createdAt;
    dto.updatedAt = notification.updatedAt;
    return dto;
  }

  toResponseList(notifications: Notification[]): NotificationResponseDto[] {
    return notifications.map((notification) => this.toResponse(notification));
  }
}
