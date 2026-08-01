import { Injectable } from '@nestjs/common';
import { SkuService } from '../sku/sku.service';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';
import { StockMovementService } from '../inventory/stock-movements/stock-movement.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly skuService: SkuService,
    private readonly stockLevelsService: StockLevelsService,
    private readonly stockMovementService: StockMovementService,
  ) {}

  async findSku(tenantId: string, skuId: string) {
    return this.skuService.findOne(tenantId, skuId);
  }

  async findLowStock(tenantId: string) {
    return this.stockLevelsService.findLowStock(tenantId);
  }

  async getMovementHistory(tenantId: string, skuId: string) {
    const { data } = await this.stockMovementService.getHistoryForSku(tenantId, skuId, {
      page: 1,
      limit: 50,
    });
    return data;
  }
}
