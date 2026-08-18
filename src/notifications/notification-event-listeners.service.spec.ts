import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sku } from '../sku/entities/sku.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { EmailService } from './email.service';
import {
  Notification,
  NotificationSeverity,
  NotificationType,
} from './entities/notification.entity';
import { ApprovalRequestedEvent } from './events/approval-requested.event';
import { LowStockDetectedEvent } from './events/low-stock-detected.event';
import { NotificationMapper } from './mappers/notification.mapper';
import { NotificationEventListeners } from './notification-event-listeners.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationEventListeners', () => {
  let listeners: NotificationEventListeners;
  let mockNotificationRepo: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockUserRepo: { createQueryBuilder: jest.Mock };
  let mockSkuRepo: { findOne: jest.Mock };
  let mockGateway: { emitToTenant: jest.Mock; emitToWarehouse: jest.Mock };
  let mockEmailService: { sendApprovalRequired: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    const notification = {
      id: 'n-1',
      type: NotificationType.APPROVAL_REQUESTED,
      title: 'New approval required',
      message: 'The reorder agent is waiting for your approval (step 2).',
      severity: NotificationSeverity.WARNING,
      data: {},
      userId: null,
      warehouseId: null,
      isRead: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockNotificationRepo = {
      create: jest.fn().mockReturnValue(notification),
      save: jest.fn().mockResolvedValue(notification),
    };

    const mockUserQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'owner@test.com' }]),
    };
    mockUserRepo = { createQueryBuilder: jest.fn().mockReturnValue(mockUserQb) };

    mockSkuRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'sku-1', name: 'Wireless Mouse' }),
    };

    mockGateway = { emitToTenant: jest.fn(), emitToWarehouse: jest.fn() };
    mockEmailService = { sendApprovalRequired: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventListeners,
        NotificationMapper,
        { provide: getRepositoryToken(Notification), useValue: mockNotificationRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Sku), useValue: mockSkuRepo },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    listeners = module.get(NotificationEventListeners);
  });

  it('should be defined', () => {
    expect(listeners).toBeDefined();
  });

  describe('approval.requested', () => {
    it('should persist a notification and deliver it to the tenant + email managers', async () => {
      const event = new ApprovalRequestedEvent('tenant-1', {
        approvalId: 'ap-1',
        agentRunId: 'run-1',
        agentType: 'reorder',
        stepNumber: 2,
        reasoning: 'Low stock',
        requestedAt: new Date().toISOString(),
      });

      await listeners.handleApprovalRequested(event);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          type: NotificationType.APPROVAL_REQUESTED,
          severity: NotificationSeverity.WARNING,
          isRead: false,
        }),
      );
      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(mockGateway.emitToTenant).toHaveBeenCalledWith('tenant-1', expect.anything());
      expect(mockEmailService.sendApprovalRequired).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ email: 'owner@test.com' })]),
        event.payload,
      );
    });
  });

  describe('lowstock.detected', () => {
    it('should resolve the SKU name and deliver to the warehouse + tenant', async () => {
      const event = new LowStockDetectedEvent('tenant-1', {
        skuId: 'sku-1',
        warehouseId: 'warehouse-1',
        quantity: 4,
        reorderThreshold: 10,
        detectedAt: new Date().toISOString(),
      });

      await listeners.handleLowStockDetected(event);

      expect(mockSkuRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sku-1' } }),
      );
      expect(mockGateway.emitToWarehouse).toHaveBeenCalledWith('warehouse-1', expect.anything());
      expect(mockGateway.emitToTenant).toHaveBeenCalledWith('tenant-1', expect.anything());
    });
  });

  describe('findUsersByRoles', () => {
    it('should include active users in the tenant with the given roles', async () => {
      const users = await (listeners as any).findUsersByRoles('tenant-1', [
        UserRole.SUPER_ADMIN,
        UserRole.TENANT,
      ]);

      expect(mockUserRepo.createQueryBuilder).toHaveBeenCalled();
      expect(users).toEqual([{ id: 'u1', email: 'owner@test.com' }]);
    });
  });
});
