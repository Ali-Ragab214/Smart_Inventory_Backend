import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { Sku } from '../../sku/entities/sku.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { StockLevelsService } from './stock-levels.service';
import { StockLevelsController } from './stock-levels.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockLevel, Sku, Warehouse])],
  controllers: [StockLevelsController],
  providers: [StockLevelsService],
  exports: [StockLevelsService],
})
export class StockLevelsModule {}
