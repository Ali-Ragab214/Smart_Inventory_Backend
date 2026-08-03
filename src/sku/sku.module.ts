import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkuService } from './sku.service';
import { SkuController } from './sku.controller';
import { Sku } from './entities/sku.entity';
import { SkuMapper } from './mappers/sku.mapper';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { StockLevelsModule } from '../inventory/stock-levels/stock-levels.module';

/**
 * Module wrapping SKU domain logic, containing controller, service, mapper, and entity definitions.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Sku, Category, Vendor]), StockLevelsModule],
  controllers: [SkuController],
  providers: [SkuService, SkuMapper],
  exports: [SkuService, SkuMapper],
})
export class SkuModule {}
