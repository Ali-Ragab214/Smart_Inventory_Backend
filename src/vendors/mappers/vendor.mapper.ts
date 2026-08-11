import { Injectable } from '@nestjs/common';
import { Vendor, VendorTier } from '../entities/vendor.entity';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';
import { VendorResponseDto } from '../dto/vendor-response.dto';

@Injectable()
export class VendorMapper {
  toEntity(dto: CreateVendorDto): Vendor {
    const vendor = new Vendor();
    vendor.name = dto.name;
    vendor.contactEmail = dto.contactEmail ?? null;
    vendor.contactPhone = dto.contactPhone ?? null;
    vendor.tier = dto.tier ?? VendorTier.TIER_2;
    return vendor;
  }

  toResponse(entity: Vendor): VendorResponseDto {
    const dto = new VendorResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.contactEmail = entity.contactEmail ?? null;
    dto.contactPhone = entity.contactPhone ?? null;
    dto.tier = entity.tier;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: Vendor[]): VendorResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }

  updateEntity(entity: Vendor, dto: UpdateVendorDto): Vendor {
    if (dto.name !== undefined) {
      entity.name = dto.name;
    }
    if (dto.contactEmail !== undefined) {
      entity.contactEmail = dto.contactEmail ?? null;
    }
    if (dto.contactPhone !== undefined) {
      entity.contactPhone = dto.contactPhone ?? null;
    }
    if (dto.tier !== undefined) {
      entity.tier = dto.tier;
    }
    return entity;
  }
}