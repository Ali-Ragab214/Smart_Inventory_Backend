
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from './entities/vendor.entity';
import { VendorCatalogEntry } from './entities/vendor-catalog-entry.entity';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorMapper } from './mappers/vendor.mapper';

@Module({
  imports: [TypeOrmModule.forFeature([Vendor, VendorCatalogEntry])],
  controllers: [VendorsController],
  providers: [VendorsService, VendorMapper],
  exports: [VendorsService, VendorMapper],
})
export class VendorsModule {}
