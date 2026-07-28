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

  async findSku(skuId: string) {
    return this.skuService.findOne(skuId);
  }

  async findLowStock() {
    return this.stockLevelsService.findLowStock();
  }

  async getMovementHistory(skuId: string) {
    const { data } = await this.stockMovementService.getHistoryForSku(skuId, {
      page: 1,
      limit: 50,
    });
    return data;
  }
}
