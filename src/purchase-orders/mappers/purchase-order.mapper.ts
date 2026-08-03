import { Injectable } from '@nestjs/common';
import { PurchaseOrder } from '../entities/purchase-order.entity';
import { PurchaseOrderLineItem } from '../entities/purchase-order-line-item.entity';
import { CreatePurchaseOrderDto, CreatePurchaseOrderLineItemDto } from '../dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto, PurchaseOrderLineItemResponseDto } from '../dto/purchase-order-response.dto';

@Injectable()
export class PurchaseOrderMapper {
  toEntity(createDto: CreatePurchaseOrderDto): PurchaseOrder {
    const po = new PurchaseOrder();
    po.vendorId = createDto.vendorId;
    po.warehouseId = createDto.warehouseId;
    po.createdBy = createDto.createdBy ?? 'manual';
    po.lineItems = createDto.lineItems.map((item) => this.toLineItemEntity(item));
    return po;
  }

  private toLineItemEntity(dto: CreatePurchaseOrderLineItemDto): PurchaseOrderLineItem {
    const entity = new PurchaseOrderLineItem();
    entity.skuId = dto.skuId;
    entity.quantity = dto.quantity;
    entity.unitPrice = dto.unitPrice;
    return entity;
  }

  toResponse(po: PurchaseOrder): PurchaseOrderResponseDto {
    const dto = new PurchaseOrderResponseDto();
    dto.id = po.id;
    dto.vendorId = po.vendorId;
    dto.warehouseId = po.warehouseId;
    dto.status = po.status;
    dto.createdBy = po.createdBy;
    dto.negotiationRunId = po.negotiationRunId;
    dto.lineItems = (po.lineItems ?? []).map((item) => this.toLineItemResponse(item));
    dto.createdAt = po.createdAt;
    dto.updatedAt = po.updatedAt;
    return dto;
  }

  private toLineItemResponse(entity: PurchaseOrderLineItem): PurchaseOrderLineItemResponseDto {
    const dto = new PurchaseOrderLineItemResponseDto();
    dto.id = entity.id;
    dto.skuId = entity.skuId;
    dto.quantity = entity.quantity;
    dto.unitPrice = entity.unitPrice;
    dto.total = entity.quantity * entity.unitPrice;
    return dto;
  }

  toResponseList(pos: PurchaseOrder[]): PurchaseOrderResponseDto[] {
    return pos.map((po) => this.toResponse(po));
  }
}
