import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sku } from '../sku/entities/sku.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from './email.service';
import { Notification } from './entities/notification.entity';
import { NotificationMapper } from './mappers/notification.mapper';
import { NotificationEventListeners } from './notification-event-listeners.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User, Sku])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationMapper,
    EmailService,
    NotificationsGateway,
    NotificationEventListeners,
  ],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
