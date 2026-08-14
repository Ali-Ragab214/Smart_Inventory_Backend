import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLineItem } from './entities/purchase-order-line-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderMapper } from './mappers/purchase-order.mapper';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { paginate } from '../utils/pagination.util';
import { StockMovementService } from '../inventory/stock-movements/stock-movement.service';
import { MovementReason } from '../inventory/stock-movements/enums/movement-reason.enum';
import { NotificationEvents } from '../notifications/events/notification-events';
import { PoReceivedEvent } from '../notifications/events/po-received.event';
import { PoCreatedEvent } from '../notifications/events/po-created.event';
import { RagEvents, PurchaseOrderSavedEvent } from '../rag/rag-events';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/entities/user.entity';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['sent'],
  sent: ['received'],
  received: ['sent'], // allow undoing receive
  rejected: [],
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    private readonly mapper: PurchaseOrderMapper,
    private readonly stockMovementService: StockMovementService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const po = this.mapper.toEntity(dto);
    po.tenantId = tenantId;
    const saved = await this.poRepository.save(po);
    const loaded = await this.poRepository.findOne({
      where: { id: saved.id },
      relations: { lineItems: true },
    });

    // Emit RAG ingestion event for the new PO
    this.eventEmitter.emit(RagEvents.PURCHASE_ORDER_SAVED, {
      tenantId,
      purchaseOrderId: loaded!.id,
      vendorId: loaded!.vendorId,
      warehouseId: loaded!.warehouseId,
      status: loaded!.status,
      createdBy: loaded!.createdBy,
      negotiationRunId: loaded!.negotiationRunId,
      lineItems: loaded!.lineItems.map((li) => ({
        skuId: li.skuId,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
    } satisfies PurchaseOrderSavedEvent);

    // Emit Notification event for the new PO
    this.eventEmitter.emit(
      NotificationEvents.PO_CREATED,
      new PoCreatedEvent(tenantId, {
        purchaseOrderId: loaded!.id,
        warehouseId: loaded!.warehouseId,
        vendorId: loaded!.vendorId,
        status: loaded!.status,
        lineItemCount: loaded!.lineItems.length,
        createdAt: new Date().toISOString(),
      }),
    );

    return this.mapper.toResponse(loaded!);
  }

  async findAll(tenantId: string, query: PurchaseOrderQueryDto): Promise<{ data: PurchaseOrderResponseDto[]; total: number }> {
    const qb = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.lineItems', 'lineItems')
      .where('po.tenantId = :tenantId', { tenantId })
      .orderBy('po.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    if (query.warehouseId) {
      qb.andWhere('po.warehouseId = :warehouseId', { warehouseId: query.warehouseId });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.mapper.toResponseList(result.data), total: result.total };
  }

  async findOne(user: UserResponseDto, id: string): Promise<PurchaseOrderResponseDto> {
    const tenantId = user.tenantId!;
    const po = await this.poRepository.findOne({
      where: { id, tenantId },
      relations: { lineItems: true },
    });
    if (!po) {
      throw new NotFoundException({ message: 'The requested purchase order could not be found.', code: 'PURCHASE_ORDER_NOT_FOUND' });
    }
    
    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId && po.warehouseId !== user.warehouseId) {
      throw new ForbiddenException({ message: 'You do not have permission to view this purchase order.', code: 'FORBIDDEN' });
    }
    
    return this.mapper.toResponse(po);
  }

  async transition(
    user: UserResponseDto,
    id: string,
    targetStatus: string,
    rating?: { ratingStars?: number; damagedUnits?: number },
  ): Promise<PurchaseOrderResponseDto> {
    const tenantId = user.tenantId!;
    const po = await this.poRepository.findOne({
      where: { id, tenantId },
      relations: { lineItems: true },
    });
    if (!po) {
      throw new NotFoundException({ message: 'The requested purchase order could not be found.', code: 'PURCHASE_ORDER_NOT_FOUND' });
    }
    
    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId && po.warehouseId !== user.warehouseId) {
      throw new ForbiddenException({ message: 'You do not have permission to transition this purchase order.', code: 'FORBIDDEN' });
    }

    const allowed = VALID_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException({ message: `Cannot transition from '${po.status}' to '${targetStatus}'. Allowed transitions: ${allowed.join(', ') || 'none (terminal status)'}`, code: 'INVALID_STATUS_TRANSITION' });
    }

    // Handle stock movements for receipt or undo
    if (targetStatus === 'received' && po.status !== 'received') {
      for (const item of po.lineItems) {
        await this.stockMovementService.recordMovement(tenantId, {
          skuId: item.skuId,
          warehouseId: po.warehouseId,
          reason: MovementReason.PURCHASE_ORDER_RECEIPT,
          quantityChange: item.quantity,
          idempotencyKey: `po-receive-${po.id}-${item.id}`,
          referenceType: 'purchase_order',
          referenceId: po.id,
          note: `Received from PO ${po.id}`,
        });
      }
    } else if (po.status === 'received' && targetStatus === 'sent') {
      for (const item of po.lineItems) {
        await this.stockMovementService.recordMovement(tenantId, {
          skuId: item.skuId,
          warehouseId: po.warehouseId,
          reason: MovementReason.PURCHASE_ORDER_RECEIPT, // Reversal
          quantityChange: -item.quantity,
          idempotencyKey: `po-undo-receive-${po.id}-${item.id}`,
          referenceType: 'purchase_order',
          referenceId: po.id,
          note: `Undo receive for PO ${po.id}`,
        });
      }
    }

    const previousStatus = po.status;
    if (targetStatus === 'received' && previousStatus !== 'received') {
      po.receiptRating = rating?.ratingStars ?? null;
      po.damagedUnits = rating?.damagedUnits ?? null;
    }
    po.status = targetStatus;
    const saved = await this.poRepository.save(po);

    if (targetStatus === 'received' && previousStatus !== 'received') {
      this.eventEmitter.emit(
        NotificationEvents.PO_RECEIVED,
        new PoReceivedEvent(tenantId, {
          purchaseOrderId: po.id,
          warehouseId: po.warehouseId,
          vendorId: po.vendorId,
          status: 'received',
          lineItemCount: po.lineItems.length,
          receivedAt: new Date().toISOString(),
        }),
      );
    }

    const loaded = await this.poRepository.findOne({
      where: { id: saved.id },
      relations: { lineItems: true },
    });

    // Emit RAG ingestion event for every status change (upsert replaces old chunk)
    this.eventEmitter.emit(RagEvents.PURCHASE_ORDER_SAVED, {
      tenantId,
      purchaseOrderId: loaded!.id,
      vendorId: loaded!.vendorId,
      warehouseId: loaded!.warehouseId,
      status: loaded!.status,
      createdBy: loaded!.createdBy,
      negotiationRunId: loaded!.negotiationRunId,
      lineItems: loaded!.lineItems.map((li) => ({
        skuId: li.skuId,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
    } satisfies PurchaseOrderSavedEvent);

    return this.mapper.toResponse(loaded!);
  }
}
