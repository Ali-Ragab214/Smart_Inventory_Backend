import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorCatalogEntry } from './entities/vendor-catalog-entry.entity';
import { CreateVendorCatalogEntryDto } from './dto/create-vendor-catalog-entry.dto';
import { UpdateVendorCatalogEntryDto } from './dto/update-vendor-catalog-entry.dto';
import { VendorCatalogEntryResponseDto } from './dto/vendor-catalog-entry-response.dto';
import { VendorCatalogEntryMapper } from './mappers/vendor-catalog-entry.mapper';
import { VendorCatalogEntryQueryDto } from './dto/vendor-catalog-entry-query.dto';
import { paginate } from '../utils/pagination.util';
import { applySortAndSearch } from '../utils/query.util';

@Injectable()
export class VendorCatalogEntriesService {
  constructor(
    @InjectRepository(VendorCatalogEntry)
    private readonly catalogRepo: Repository<VendorCatalogEntry>,
    private readonly mapper: VendorCatalogEntryMapper,
  ) {}

  async create(
    vendorId: string,
    dto: CreateVendorCatalogEntryDto,
  ): Promise<VendorCatalogEntryResponseDto> {
    const existing = await this.catalogRepo.findOne({
      where: { vendorId, skuId: dto.skuId },
    });
    if (existing) {
      throw new ConflictException(
        `Catalog entry for vendor "${vendorId}" and SKU "${dto.skuId}" already exists`,
      );
    }

    const entry = this.mapper.toEntity(dto, vendorId);
    const saved = await this.catalogRepo.save(entry);
    return this.mapper.toResponse(saved);
  }

  async findAll(
    vendorId: string,
    query: VendorCatalogEntryQueryDto,
  ): Promise<{ data: VendorCatalogEntryResponseDto[]; total: number }> {
    const qb = this.catalogRepo.createQueryBuilder('entry');
    qb.where('entry.vendorId = :vendorId', { vendorId });

    if (query.skuId) {
      qb.andWhere('entry.skuId = :skuId', { skuId: query.skuId });
    }

    applySortAndSearch(qb, 'entry', query.sortBy, query.sortOrder, query.search, ['skuId']);
    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.mapper.toResponseList(result.data), total: result.total };
  }

  async findOne(vendorId: string, id: string): Promise<VendorCatalogEntryResponseDto> {
    const entry = await this.catalogRepo.findOne({ where: { id, vendorId } });
    if (!entry) {
      throw new NotFoundException(
        `Catalog entry with ID "${id}" not found for vendor "${vendorId}"`,
      );
    }
    return this.mapper.toResponse(entry);
  }

  async update(
    vendorId: string,
    id: string,
    dto: UpdateVendorCatalogEntryDto,
  ): Promise<VendorCatalogEntryResponseDto> {
    const entry = await this.catalogRepo.findOne({ where: { id, vendorId } });
    if (!entry) {
      throw new NotFoundException(
        `Catalog entry with ID "${id}" not found for vendor "${vendorId}"`,
      );
    }

    const updated = this.mapper.updateEntity(entry, dto);
    const saved = await this.catalogRepo.save(updated);
    return this.mapper.toResponse(saved);
  }

  async remove(vendorId: string, id: string): Promise<void> {
    const entry = await this.catalogRepo.findOne({ where: { id, vendorId } });
    if (!entry) {
      throw new NotFoundException(
        `Catalog entry with ID "${id}" not found for vendor "${vendorId}"`,
      );
    }
    await this.catalogRepo.softRemove(entry);
  }
}
