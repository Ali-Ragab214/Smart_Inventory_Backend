
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from './entities/vendor.entity';
import { VendorCatalogEntry } from './entities/vendor-catalog-entry.entity';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorMapper } from './mappers/vendor.mapper';
import { VendorCatalogEntriesController } from './vendor-catalog-entries.controller';
import { VendorCatalogEntriesService } from './vendor-catalog-entries.service';
import { VendorCatalogEntryMapper } from './mappers/vendor-catalog-entry.mapper';

@Module({
  imports: [TypeOrmModule.forFeature([Vendor, VendorCatalogEntry])],
  controllers: [VendorsController, VendorCatalogEntriesController],
  providers: [VendorsService, VendorMapper, VendorCatalogEntriesService, VendorCatalogEntryMapper],
  exports: [VendorsService, VendorMapper, VendorCatalogEntriesService],
})
export class VendorsModule {}
