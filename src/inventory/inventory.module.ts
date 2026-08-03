import { Module } from '@nestjs/common';
import { StockMovementModule } from './stock-movements/stock-movement.module';
import { StockLevelsModule } from './stock-levels/stock-levels.module';

@Module({
  imports: [
    StockMovementModule,
    StockLevelsModule,
  ],
  exports: [StockMovementModule, StockLevelsModule],
})
export class InventoryModule {}
