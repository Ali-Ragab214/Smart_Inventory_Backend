import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { WarehouseMapper } from './mappers/warehouse.mapper';
import { StockLevelsModule } from '../inventory/stock-levels/stock-levels.module';

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse]), StockLevelsModule],
  controllers: [WarehousesController],
  providers: [WarehousesService, WarehouseMapper],
  exports: [WarehousesService],
})
export class WarehousesModule {}
