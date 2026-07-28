import { Injectable } from '@nestjs/common';
import { VendorCatalogEntry } from '../entities/vendor-catalog-entry.entity';
import { CreateVendorCatalogEntryDto } from '../dto/create-vendor-catalog-entry.dto';
import { UpdateVendorCatalogEntryDto } from '../dto/update-vendor-catalog-entry.dto';
import { VendorCatalogEntryResponseDto } from '../dto/vendor-catalog-entry-response.dto';

@Injectable()
export class VendorCatalogEntryMapper {
  toEntity(dto: CreateVendorCatalogEntryDto, vendorId: string): VendorCatalogEntry {
    const entry = new VendorCatalogEntry();
    entry.vendorId = vendorId;
    entry.skuId = dto.skuId;
    entry.price = dto.price;
    entry.leadTimeDays = dto.leadTimeDays ?? 0;
    return entry;
  }

  toResponse(entity: VendorCatalogEntry): VendorCatalogEntryResponseDto {
    const dto = new VendorCatalogEntryResponseDto();
    dto.id = entity.id;
    dto.vendorId = entity.vendorId;
    dto.skuId = entity.skuId;
    dto.price = entity.price;
    dto.leadTimeDays = entity.leadTimeDays;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: VendorCatalogEntry[]): VendorCatalogEntryResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }

  updateEntity(entity: VendorCatalogEntry, dto: UpdateVendorCatalogEntryDto): VendorCatalogEntry {
    if (dto.price !== undefined) {
      entity.price = dto.price;
    }
    if (dto.leadTimeDays !== undefined) {
      entity.leadTimeDays = dto.leadTimeDays;
    }
    return entity;
  }
}
