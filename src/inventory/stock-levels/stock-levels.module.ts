import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { Sku } from '../../sku/entities/sku.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { StockLevelsService } from './stock-levels.service';
import { WarehouseStockLevelsController } from './warehouse-stock-levels.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockLevel, Sku, Warehouse])],
  controllers: [WarehouseStockLevelsController],
  providers: [StockLevelsService],
  exports: [StockLevelsService],
})
export class StockLevelsModule {}
