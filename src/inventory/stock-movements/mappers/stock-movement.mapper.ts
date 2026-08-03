import { Injectable } from '@nestjs/common';
import { StockMovement } from '../entities/stock-movement.entity';
import { StockMovementResponseDto } from '../dto/stock-movement-response.dto';

@Injectable()
export class StockMovementMapper {
  toResponse(entity: StockMovement): StockMovementResponseDto {
    const dto = new StockMovementResponseDto();
    dto.id = entity.id;
    dto.skuId = entity.skuId;
    dto.skuCode = entity.sku?.sku ?? null;
    dto.skuName = entity.sku?.name ?? null;
    dto.warehouseId = entity.warehouseId;
    dto.reason = entity.reason;
    dto.quantityChange = entity.quantityChange;
    dto.balanceAfter = entity.balanceAfter;
    dto.performedByUserId = entity.performedByUserId ?? null;
    dto.performedByAgent = entity.performedByAgent ?? null;
    dto.referenceType = entity.referenceType ?? null;
    dto.referenceId = entity.referenceId ?? null;
    dto.note = entity.note ?? null;
    dto.createdAt = entity.createdAt;
    // idempotencyKey is intentionally NOT mapped
    return dto;
  }

  toResponseList(entities: StockMovement[]): StockMovementResponseDto[] {
    return entities.map((e) => this.toResponse(e));
  }
}
