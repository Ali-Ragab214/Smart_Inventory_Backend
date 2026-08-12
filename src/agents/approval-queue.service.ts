import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
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
import { RagEvents, NegotiationApprovedEvent } from '../rag/rag-events';
import { VendorChannelService } from './vendor-channel/vendor-channel.service';

@Injectable()
export class ApprovalQueueService {
  private readonly logger = new Logger(ApprovalQueueService.name);

  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepo: Repository<ApprovalRequest>,
    private readonly mapper: ApprovalRequestMapper,
    private readonly agentRunService: AgentRunService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly vendorChannelService: VendorChannelService,
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

  async findAll(
    tenantId: string,
    query: ApprovalQueryDto,
  ): Promise<{ data: ApprovalRequestResponseDto[]; total: number }> {
    const qb = this.approvalRepo
      .createQueryBuilder('approval')
      .where('approval.tenantId = :tenantId', { tenantId })
      .orderBy('approval.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('approval.status = :status', {
        status: query.status,
      });
    }

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
  ): Promise<ApprovalRequestResponseDto & { createdPoIds?: string[] }> {
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
    if (approval.agentType === 'reorder') {
      await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'completed');
    }

    // Materialize an approved reorder proposal into purchase order(s).
    let createdPoIds: string[] = [];
    if (approval.agentType === 'reorder') {
      createdPoIds = await this.finalizeReorderPo(tenantId, approval, reviewedBy);
    } else if (approval.agentType === 'negotiation') {
      if (approval.stepNumber === 2) {
        // Final sign-off → negotiate final PO at the agreed discounted prices.
        createdPoIds = await this.finalizeNegotiationPo(tenantId, saved, reviewedBy);
        await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'completed');
      } else {
        // Step 1 (Vendor Outreach) approved → deliver the offer through the
        // configured vendor channel (real email when enabled, else simulated).
        await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'sent');
        const payload = (saved.payload ?? {}) as Record<string, unknown>;
        const offeredDiscount = Number(payload.requestedDiscountPercent ?? payload.finalDiscountPercent ?? 0);
        const paymentTermsDays = Math.max(30, Math.round(Number(payload.paymentTermsDays) || 30));
        const shippingCost = Math.max(0, Number(payload.shippingCost) || 50);
        await this.vendorChannelService.dispatchOffer(
          tenantId,
          saved.id,
          saved.agentRunId,
          { discountPercent: offeredDiscount, paymentTermsDays, shippingCost },
          payload,
        );
      }
    }

    return { ...this.mapper.toResponse(saved), createdPoIds };
  }

  private async finalizeReorderPo(
    tenantId: string,
    approval: ApprovalRequest,
    reviewedBy: string,
  ): Promise<string[]> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const vendorId = payload.vendorId as string | undefined;
    const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
    const createdPoIds: string[] = [];

    if (!vendorId || items.length === 0) {
      this.logger.warn(
        `Cannot create PO for approval ${approval.id}: missing vendorId or line items.`,
      );
      return createdPoIds;
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
          approvalRequestId: approval.id,
          status: 'pending_approval',
        });
        createdPoIds.push(po.id);
        this.logger.log(
          `Approval ${approval.id} finalized into PO ${po.id} (warehouse ${warehouseId}, ${lineItems.length} line item(s)).`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to create PO for approval ${approval.id}: ${(err as Error).message}`,
        );
      }
    }

    return createdPoIds;
  }

  /** 3.3 — Final sign-off of a negotiated round: create PO(s) at agreed discounts. */
  private async finalizeNegotiationPo(
    tenantId: string,
    approval: ApprovalRequest,
    reviewedBy: string,
  ): Promise<string[]> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const vendorId = (payload.vendorId as string | undefined) ?? undefined;
    const finalDiscount = Number(
      payload.finalDiscountPercent ?? payload.final ?? payload.requestedDiscountPercent ?? 0,
    );
    const createdPoIds: string[] = [];

    if (!vendorId) {
      this.logger.warn(`Cannot create negotiated PO for approval ${approval.id}: missing vendorId.`);
      return createdPoIds;
    }

    const run = await this.agentRunService.loadEntity(tenantId, approval.agentRunId);
    let items: Array<Record<string, unknown>> =
      (run?.negotiationItems as Array<Record<string, unknown>> | undefined) ??
      (Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : []) ??
      [];

    // Fallback: load items from the original reorder approval via contextRunId
    if (items.length === 0 && run?.contextRunId) {
      const originalApproval = await this.approvalRepo.findOne({
        where: { agentRunId: run.contextRunId, tenantId },
      });
      if (originalApproval) {
        const originalPayload = (originalApproval.payload ?? {}) as Record<string, unknown>;
        items = Array.isArray(originalPayload.items)
          ? (originalPayload.items as Array<Record<string, unknown>>)
          : [];
        if (items.length > 0) {
          this.logger.log(`Loaded ${items.length} items from original reorder approval ${originalApproval.id} for negotiation PO.`);
        }
      }
    }

    if (items.length === 0) {
      this.logger.warn(`Cannot create negotiated PO for approval ${approval.id}: no items.`);
      return createdPoIds;
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
        .map((item) => {
          const basePrice = Math.max(0, Number(item.unitPrice || 0));
          const unitPrice =
            Math.round(basePrice * (1 - finalDiscount / 100) * 10000) / 10000;
          return {
            skuId: String(item.skuId ?? ''),
            quantity: Math.max(1, Math.round(Number(item.recommendedQuantity) || 1)),
            unitPrice,
          };
        })
        .filter((line) => line.skuId && line.unitPrice > 0);
      if (lineItems.length === 0) continue;

      try {
        const po = await this.purchaseOrdersService.create(tenantId, {
          vendorId,
          warehouseId,
          lineItems,
          createdBy: reviewedBy,
          approvalRequestId: approval.id,
          negotiationRunId: approval.agentRunId,
          status: 'pending_approval',
        });
        createdPoIds.push(po.id);
        this.logger.log(
          `Negotiation ${approval.id} finalized into PO ${po.id} at ${finalDiscount}% discount (warehouse ${warehouseId}).`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to create negotiated PO for approval ${approval.id}: ${(err as Error).message}`,
        );
      }
    }

    this.eventEmitter.emit(
      RagEvents.NEGOTIATION_APPROVED,
      {
        tenantId,
        approvalId: approval.id,
        vendorId,
        agentRunId: approval.agentRunId,
        reasoning: approval.reasoning ?? '',
        payload: { ...payload, finalDiscountPercent: finalDiscount },
      } satisfies NegotiationApprovedEvent,
    );

    return createdPoIds;
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

  async negotiate(
    tenantId: string,
    id: string,
    reviewedBy: string,
  ): Promise<ApprovalRequestResponseDto> {
    const approval = await this.approvalRepo.findOne({ where: { id, tenantId } });
    if (!approval) {
      throw new NotFoundException({ message: 'This approval request could not be found or has expired.', code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }
    if (approval.status !== 'pending') {
      throw new BadRequestException({ message: 'Only pending approval requests can be sent to negotiation.', code: 'APPROVAL_NOT_PENDING' });
    }
    if (approval.agentType !== 'reorder') {
      throw new BadRequestException({ message: 'Negotiation handoff is only available for reorder proposals.', code: 'NEGOTIATION_NOT_ALLOWED' });
    }

    approval.status = 'deferred';
    approval.reviewedBy = reviewedBy;
    approval.reviewedAt = new Date();
    const saved = await this.approvalRepo.save(approval);
    await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'escalated');

    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const items = Array.isArray(payload.items)
      ? (payload.items as Array<Record<string, unknown>>)
      : [];
    const skuIds = [...new Set(items.map((item) => String(item.skuId ?? '')).filter(Boolean))];
    const vendorId = (payload.vendorId as string | undefined) ?? undefined;

    const runResult = await this.agentRunService.start(tenantId, 'negotiation', {
      skuIds,
      vendorId,
      contextRunId: approval.agentRunId,
      negotiationItems: items,
    });
    const negRunId = (runResult as any).data?.id ?? (runResult as any).id;
    await this.agentRunService.enqueue(tenantId, negRunId, 'negotiation');
    this.logger.log(
      `Approval ${approval.id} deferred to negotiation run ${negRunId} (${skuIds.length} SKU(s)).`,
    );

    return this.mapper.toResponse(saved);
  }
}
