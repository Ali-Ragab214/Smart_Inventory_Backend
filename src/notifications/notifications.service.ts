import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationMapper } from './mappers/notification.mapper';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/entities/user.entity';
import { paginate } from '../utils/pagination.util';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly mapper: NotificationMapper,
  ) {}

  async findAll(
    user: UserResponseDto,
    query: NotificationQueryDto,
  ): Promise<{ data: NotificationResponseDto[]; total: number }> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('(n.userId IS NULL OR n.userId = :userId)', {
        userId: user.id,
      });

    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      qb.andWhere('(n.warehouseId IS NULL OR n.warehouseId = :userWarehouseId)', {
        userWarehouseId: user.warehouseId,
      });
    }

    qb.orderBy('n.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('n.type = :type', { type: query.type });
    }
    if (query.isRead !== undefined) {
      qb.andWhere('n.isRead = :isRead', { isRead: query.isRead === 'true' });
    }
    if (query.warehouseId) {
      qb.andWhere('(n.warehouseId IS NULL OR n.warehouseId = :warehouseId)', {
        warehouseId: query.warehouseId,
      });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.mapper.toResponseList(result.data), total: result.total };
  }

  async unreadCount(user: UserResponseDto): Promise<number> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('n.isRead = :isRead', { isRead: false })
      .andWhere('(n.userId IS NULL OR n.userId = :userId)', {
        userId: user.id,
      });

    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      qb.andWhere('(n.warehouseId IS NULL OR n.warehouseId = :userWarehouseId)', {
        userWarehouseId: user.warehouseId,
      });
    } else if (user.warehouseId) {
      qb.andWhere('(n.warehouseId IS NULL OR n.warehouseId = :warehouseId)', {
        warehouseId: user.warehouseId,
      });
    }

    return qb.getCount();
  }

  async findOne(user: UserResponseDto, id: string): Promise<NotificationResponseDto> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere('n.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('(n.userId IS NULL OR n.userId = :userId)', { userId: user.id });

    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      qb.andWhere('(n.warehouseId IS NULL OR n.warehouseId = :userWarehouseId)', {
        userWarehouseId: user.warehouseId,
      });
    }

    const notification = await qb.getOne();
    if (!notification) {
      throw new NotFoundException({
        message: "We couldn't find this notification.",
        code: 'NOTIFICATION_NOT_FOUND',
      });
    }
    return this.mapper.toResponse(notification);
  }

  async markAsRead(user: UserResponseDto, id: string): Promise<NotificationResponseDto> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere('n.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('(n.userId IS NULL OR n.userId = :userId)', { userId: user.id });

    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      qb.andWhere('(n.warehouseId IS NULL OR n.warehouseId = :userWarehouseId)', {
        userWarehouseId: user.warehouseId,
      });
    }

    const notification = await qb.getOne();
    if (!notification) {
      throw new NotFoundException({
        message: "We couldn't find this notification.",
        code: 'NOTIFICATION_NOT_FOUND',
      });
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }

    return this.mapper.toResponse(notification);
  }

  async markAllAsRead(user: UserResponseDto): Promise<{ updated: number }> {
    const qb = this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere('isRead = :isRead', { isRead: false })
      .andWhere('(userId IS NULL OR userId = :userId)', { userId: user.id });

    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      qb.andWhere('(warehouseId IS NULL OR warehouseId = :userWarehouseId)', {
        userWarehouseId: user.warehouseId,
      });
    }

    const result = await qb.execute();

    return { updated: result.affected ?? 0 };
  }
}
