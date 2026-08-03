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
    tenantId: string,
    vendorId: string,
    dto: CreateVendorCatalogEntryDto,
  ): Promise<VendorCatalogEntryResponseDto> {
    const existing = await this.catalogRepo.findOne({
      where: { vendorId, skuId: dto.skuId, tenantId },
    });
    if (existing) {
      throw new ConflictException({ message: 'A catalog entry for this product and vendor already exists.', code: 'DUPLICATE_CATALOG_ENTRY' });
    }

    const entry = this.mapper.toEntity(dto, vendorId);
    entry.tenantId = tenantId;
    const saved = await this.catalogRepo.save(entry);
    return this.mapper.toResponse(saved);
  }

  async findAll(
    tenantId: string,
    vendorId: string,
    query: VendorCatalogEntryQueryDto,
  ): Promise<{ data: VendorCatalogEntryResponseDto[]; total: number }> {
    const qb = this.catalogRepo.createQueryBuilder('entry');
    qb.where('entry.vendorId = :vendorId', { vendorId })
      .andWhere('entry.tenantId = :tenantId', { tenantId });

    if (query.skuId) {
      qb.andWhere('entry.skuId = :skuId', { skuId: query.skuId });
    }

    applySortAndSearch(qb, 'entry', query.sortBy, query.sortOrder, query.search, ['skuId']);
    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.mapper.toResponseList(result.data), total: result.total };
  }

  async findOne(tenantId: string, vendorId: string, id: string): Promise<VendorCatalogEntryResponseDto> {
    const entry = await this.catalogRepo.findOne({ where: { id, vendorId, tenantId } });
    if (!entry) {
      throw new NotFoundException({ message: "We couldn't find a catalog entry for this product and vendor combination.", code: 'CATALOG_ENTRY_NOT_FOUND' });
    }
    return this.mapper.toResponse(entry);
  }

  async update(
    tenantId: string,
    vendorId: string,
    id: string,
    dto: UpdateVendorCatalogEntryDto,
  ): Promise<VendorCatalogEntryResponseDto> {
    const entry = await this.catalogRepo.findOne({ where: { id, vendorId, tenantId } });
    if (!entry) {
      throw new NotFoundException({ message: "We couldn't find a catalog entry for this product and vendor combination.", code: 'CATALOG_ENTRY_NOT_FOUND' });
    }

    const updated = this.mapper.updateEntity(entry, dto);
    const saved = await this.catalogRepo.save(updated);
    return this.mapper.toResponse(saved);
  }

  async remove(tenantId: string, vendorId: string, id: string): Promise<void> {
    const entry = await this.catalogRepo.findOne({ where: { id, vendorId, tenantId } });
    if (!entry) {
      throw new NotFoundException({ message: "We couldn't find a catalog entry for this product and vendor combination.", code: 'CATALOG_ENTRY_NOT_FOUND' });
    }
    await this.catalogRepo.softRemove(entry);
  }
}
