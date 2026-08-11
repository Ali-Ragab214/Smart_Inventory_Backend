import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
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
import { NotificationEvents } from './events/notification-events';
import { PoReceivedEvent } from './events/po-received.event';
import { VendorRespondedEvent } from './events/vendor-responded.event';
import { NotificationMapper } from './mappers/notification.mapper';
import { NotificationsGateway } from './notifications.gateway';

interface PersistParams {
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  data: object;
  userId?: string | null;
  warehouseId?: string | null;
}

@Injectable()
export class NotificationEventListeners {
  private readonly logger = new Logger(NotificationEventListeners.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Sku)
    private readonly skuRepo: Repository<Sku>,
    private readonly mapper: NotificationMapper,
    private readonly gateway: NotificationsGateway,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent(NotificationEvents.APPROVAL_REQUESTED, { async: true })
  async handleApprovalRequested(event: ApprovalRequestedEvent): Promise<void> {
    const { payload } = event;
    const notification = await this.persist({
      tenantId: event.tenantId,
      type: NotificationType.APPROVAL_REQUESTED,
      severity: NotificationSeverity.WARNING,
      title: 'New approval required',
      message: `The ${payload.agentType} agent is waiting for your approval (step ${payload.stepNumber}).`,
      data: payload as object,
    });
    this.gateway.emitToTenant(event.tenantId, notification);

    const recipients = await this.findUsersByRoles(event.tenantId, [
      UserRole.SUPER_ADMIN,
      UserRole.TENANT_OWNER,
      UserRole.WAREHOUSE_MANAGER,
    ]);
    await this.emailService.sendApprovalRequired(recipients, payload);
  }

  @OnEvent(NotificationEvents.LOW_STOCK_DETECTED, { async: true })
  async handleLowStockDetected(event: LowStockDetectedEvent): Promise<void> {
    const { payload } = event;
    const skuName = await this.resolveSkuName(payload.skuId, payload.skuName);

    const notification = await this.persist({
      tenantId: event.tenantId,
      type: NotificationType.LOW_STOCK_DETECTED,
      severity: NotificationSeverity.WARNING,
      title: 'Low stock alert',
      message: `${skuName} is below its reorder threshold (${payload.quantity} remaining, threshold ${payload.reorderThreshold}).`,
      data: payload as object,
      warehouseId: payload.warehouseId,
    });

    this.gateway.emitToWarehouse(payload.warehouseId, notification);
    this.gateway.emitToTenant(event.tenantId, notification);
  }

  @OnEvent(NotificationEvents.PO_RECEIVED, { async: true })
  async handlePoReceived(event: PoReceivedEvent): Promise<void> {
    const { payload } = event;
    const notification = await this.persist({
      tenantId: event.tenantId,
      type: NotificationType.PO_RECEIVED,
      severity: NotificationSeverity.INFO,
      title: 'Purchase order received',
      message: `Purchase order ${payload.purchaseOrderId} was received with ${payload.lineItemCount} line item(s).`,
      data: payload as object,
      warehouseId: payload.warehouseId,
    });

    this.gateway.emitToWarehouse(payload.warehouseId, notification);
    this.gateway.emitToTenant(event.tenantId, notification);
  }

  @OnEvent(NotificationEvents.VENDOR_RESPONDED, { async: true })
  async handleVendorResponded(event: VendorRespondedEvent): Promise<void> {
    const { payload } = event;
    const notification = await this.persist({
      tenantId: event.tenantId,
      type: NotificationType.VENDOR_RESPONDED,
      severity: NotificationSeverity.INFO,
      title: 'New vendor offer',
      message: `Vendor ${payload.vendorId} published an offer for SKU ${payload.skuId}.`,
      data: payload as object,
    });
    this.gateway.emitToTenant(event.tenantId, notification);
  }

  private async persist(params: PersistParams): Promise<Notification> {
    const notification = this.notificationRepo.create({
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      warehouseId: params.warehouseId ?? null,
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity,
      data: params.data,
      isRead: false,
      readAt: null,
    });
    const saved = await this.notificationRepo.save(notification);
    this.logger.log(
      `Notification persisted: type=${params.type} id=${saved.id} tenant=${params.tenantId}`,
    );
    return saved;
  }

  private async resolveSkuName(
    skuId: string,
    fallback?: string,
  ): Promise<string> {
    if (fallback) return fallback;
    try {
      const sku = await this.skuRepo.findOne({
        where: { id: skuId },
        select: ['id', 'name'],
      });
      return sku?.name ?? skuId;
    } catch {
      return skuId;
    }
  }

  private async findUsersByRoles(
    tenantId: string,
    roles: UserRole[],
  ): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('user.isActive = :isActive', { isActive: true })
      .andWhere(
        new Brackets((qb) => {
          qb.where(
            'user.tenantId = :tenantId AND user.role IN (:...roles)',
            { tenantId, roles },
          );
          if (roles.includes(UserRole.SUPER_ADMIN)) {
            qb.orWhere('user.role = :superAdminRole', {
              superAdminRole: UserRole.SUPER_ADMIN,
            });
          }
        }),
      )
      .getMany();
  }

}
