import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/entities/user.entity';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { Notification } from './entities/notification.entity';
import { NotificationMapper } from './mappers/notification.mapper';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const user: UserResponseDto = {
    id: 'user-1',
    name: null,
    phone: null,
    avatarUrl: null,
    location: null,
    bio: null,
    email: 'manager@test.com',
    username: 'manager',
    role: UserRole.WAREHOUSE_MANAGER,
    isActive: true,
    tenantId: 'tenant-1',
    warehouseId: 'warehouse-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  async function buildService(repoValue: any): Promise<NotificationsService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        NotificationMapper,
        { provide: getRepositoryToken(Notification), useValue: repoValue },
      ],
    }).compile();
    return module.get(NotificationsService);
  }

  it('should be defined', async () => {
    service = await buildService({});
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated notifications scoped to the user', async () => {
      const now = new Date();
      const mockData = [
        { id: 'n1', type: 'lowstock.detected', title: 'Low stock', message: 'x', data: {}, severity: 'warning', userId: null, warehouseId: null, isRead: false, readAt: null, createdAt: now, updatedAt: now },
      ];
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockData, 1]),
      };

      const query: NotificationQueryDto = { page: 1, limit: 10 };
      service = await buildService({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      });
      const result = await service.findAll(user, query);

      expect(mockQb.where).toHaveBeenCalledWith('n.tenantId = :tenantId', { tenantId: 'tenant-1' });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark an unread notification as read', async () => {
      const notification = {
        id: 'n1',
        type: 'approval.requested',
        title: 'Approval',
        message: 'm',
        data: {},
        severity: 'warning',
        userId: null,
        warehouseId: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(notification),
      };
      const repoMock = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        save: jest.fn().mockImplementation((n) => Promise.resolve(n)),
      };

      service = await buildService(repoMock);
      const result = await service.markAsRead(user, 'n1');

      expect(notification.isRead).toBe(true);
      expect(notification.readAt).toBeInstanceOf(Date);
      expect(repoMock.save).toHaveBeenCalled();
      expect(result.isRead).toBe(true);
    });

    it('should throw NotFoundException when the notification does not exist', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      const repoMock = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        save: jest.fn(),
      };

      service = await buildService(repoMock);
      await expect(service.markAsRead(user, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread notifications for the user', async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };

      service = await buildService({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      });

      const result = await service.markAllAsRead(user);

      expect(mockQb.update).toHaveBeenCalled();
      expect(result.updated).toBe(3);
    });
  });

  describe('unreadCount', () => {
    it('should count unread notifications', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5),
      };

      service = await buildService({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      });

      const count = await service.unreadCount(user);

      expect(count).toBe(5);
    });
  });
});
