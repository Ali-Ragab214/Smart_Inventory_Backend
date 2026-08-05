import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { ApprovalQueryDto } from './dto/approval-query.dto';
import { paginate } from '../utils/pagination.util';
import { AgentRunService } from './agent-run.service';
import { ApprovalRequestResponseDto } from './dto/approval-request-response.dto';
import { ApproveApprovalRequestDto, RejectApprovalRequestDto } from './dto/approval-action.dto';
import { NotificationEvents } from '../notifications/events/notification-events';
import { ApprovalRequestedEvent } from '../notifications/events/approval-requested.event';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

@Injectable()
export class ApprovalQueueService {
  private readonly logger = new Logger(ApprovalQueueService.name);

  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepo: Repository<ApprovalRequest>,
    private readonly mapper: ApprovalRequestMapper,
    private readonly agentRunService: AgentRunService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, data: CreateApprovalRequestDto): Promise<ApprovalRequestResponseDto> {
    const approval = this.approvalRepo.create({
      tenantId,
      agentRunId: data.agentRunId,
      agentType: data.agentType,
      stepNumber: data.stepNumber,
      payload: data.payload,
      reasoning: data.reasoning,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
    });

    const saved = await this.approvalRepo.save(approval);

    this.eventEmitter.emit(
      NotificationEvents.APPROVAL_REQUESTED,
      new ApprovalRequestedEvent(tenantId, {
        approvalId: saved.id,
        agentRunId: saved.agentRunId,
        agentType: saved.agentType,
        stepNumber: saved.stepNumber,
        reasoning: saved.reasoning,
        requestedAt: saved.createdAt.toISOString(),
      }),
    );

    return this.mapper.toResponse(saved);
  }

  async findPending(
    tenantId: string,
    query: ApprovalQueryDto,
  ): Promise<{ data: ApprovalRequestResponseDto[]; total: number }> {
    const qb = this.approvalRepo
      .createQueryBuilder('approval')
      .where('approval.status = :status', { status: 'pending' })
      .andWhere('approval.tenantId = :tenantId', { tenantId })
      .orderBy('approval.createdAt', 'DESC');

    if (query.agentType) {
      qb.andWhere('approval.agentType = :agentType', {
        agentType: query.agentType,
      });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return {
      data: this.mapper.toResponseList(result.data),
      total: result.total,
    };
  }

  async approve(
    tenantId: string,
    id: string,
    reviewedBy: string,
    editedPayload?: object,
  ): Promise<ApprovalRequestResponseDto> {
    const approval = await this.approvalRepo.findOne({ where: { id, tenantId } });
    if (!approval) {
      throw new NotFoundException({ message: 'This approval request could not be found or has expired.', code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }

    approval.status = 'approved';
    approval.reviewedBy = reviewedBy;
    approval.reviewedAt = new Date();
    if (editedPayload) {
      approval.payload = {
        ...(approval.payload as Record<string, unknown>),
        ...(editedPayload as Record<string, unknown>),
      };
    }

    const saved = await this.approvalRepo.save(approval);

    // Finalize the agent run once the request has been decided.
    await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'completed');

    // Materialize an approved reorder proposal into purchase order(s).
    if (approval.agentType === 'reorder') {
      await this.finalizeReorderPo(tenantId, approval, reviewedBy);
    }

    return this.mapper.toResponse(saved);
  }

  private async finalizeReorderPo(
    tenantId: string,
    approval: ApprovalRequest,
    reviewedBy: string,
  ): Promise<void> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const vendorId = payload.vendorId as string | undefined;
    const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];

    if (!vendorId || items.length === 0) {
      this.logger.warn(
        `Cannot create PO for approval ${approval.id}: missing vendorId or line items.`,
      );
      return;
    }

    const byWarehouse = new Map<string, Array<Record<string, unknown>>>();
    for (const item of items) {
      const warehouseId = item.warehouseId as string | undefined;
      if (!warehouseId) continue;
      const group = byWarehouse.get(warehouseId) ?? [];
      group.push(item);
      byWarehouse.set(warehouseId, group);
    }

    for (const [warehouseId, groupItems] of byWarehouse) {
      const lineItems = groupItems
        .map((item) => ({
          skuId: String(item.skuId ?? ''),
          quantity: Math.max(1, Math.round(Number(item.recommendedQuantity) || 1)),
          unitPrice: Number(item.unitPrice) || 0,
        }))
        .filter((line) => line.skuId && line.unitPrice > 0);
      if (lineItems.length === 0) continue;

      try {
        const po = await this.purchaseOrdersService.create(tenantId, {
          vendorId,
          warehouseId,
          lineItems,
          createdBy: reviewedBy,
        });
        this.logger.log(
          `Approval ${approval.id} finalized into PO ${po.id} (warehouse ${warehouseId}, ${lineItems.length} line item(s)).`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to create PO for approval ${approval.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  async reject(
    tenantId: string,
    id: string,
    reviewedBy: string,
  ): Promise<ApprovalRequestResponseDto> {
    const approval = await this.approvalRepo.findOne({ where: { id, tenantId } });
    if (!approval) {
      throw new NotFoundException({ message: 'This approval request could not be found or has expired.', code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }

    approval.status = 'rejected';
    approval.reviewedBy = reviewedBy;
    approval.reviewedAt = new Date();
    const saved = await this.approvalRepo.save(approval);
    await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'rejected');
    return this.mapper.toResponse(saved);
  }
}
