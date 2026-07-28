
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from './entities/vendor.entity';
import { VendorCatalogEntry } from './entities/vendor-catalog-entry.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { VendorMapper } from './mappers/vendor.mapper';
import { VendorQueryDto } from './dto/vendor-query.dto';
import { paginate } from '../utils/pagination.util';
import { applySortAndSearch } from '../utils/query.util';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
    @InjectRepository(VendorCatalogEntry)
    private readonly catalogEntryRepo: Repository<VendorCatalogEntry>,
    private readonly vendorMapper: VendorMapper,
  ) {}

  async create(dto: CreateVendorDto): Promise<VendorResponseDto> {
    const vendor = this.vendorMapper.toEntity(dto);
    const saved = await this.vendorRepository.save(vendor);
    return this.vendorMapper.toResponse(saved);
  }

  async findAll(query: VendorQueryDto): Promise<{ data: VendorResponseDto[]; total: number }> {
    const qb = this.vendorRepository.createQueryBuilder('vendor');
    applySortAndSearch(qb, 'vendor', query.sortBy, query.sortOrder, query.search, ['name', 'contactEmail']);
    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.vendorMapper.toResponseList(result.data), total: result.total };
  }

  async findOne(id: string): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }
    return this.vendorMapper.toResponse(vendor);
  }

  async update(id: string, dto: UpdateVendorDto): Promise<VendorResponseDto> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    const updated = this.vendorMapper.updateEntity(vendor, dto);
    const saved = await this.vendorRepository.save(updated);
    return this.vendorMapper.toResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const vendor = await this.vendorRepository.findOne({ where: { id } });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }
    await this.vendorRepository.softRemove(vendor);
  }

  async findVendorsForSku(skuId: string) {
    const entries = await this.catalogEntryRepo
      .createQueryBuilder('ce')
      .leftJoinAndSelect('ce.vendor', 'vendor')
      .where('ce.skuId = :skuId', { skuId })
      .orderBy('ce.price', 'ASC')
      .getMany();

    return entries.map((entry) => ({
      vendorId: entry.vendorId,
      vendorName: entry.vendor?.name ?? '',
      price: entry.price,
      leadTimeDays: entry.leadTimeDays,
    }));
  }

  async getVendorCatalogEntry(vendorId: string, skuId: string) {
    const entry = await this.catalogEntryRepo
      .createQueryBuilder('ce')
      .leftJoinAndSelect('ce.vendor', 'vendor')
      .where('ce.vendorId = :vendorId', { vendorId })
      .andWhere('ce.skuId = :skuId', { skuId })
      .getOne();

    if (!entry) {
      throw new NotFoundException(
        `Catalog entry not found for vendor "${vendorId}" and SKU "${skuId}"`,
      );
    }

    return {
      vendorId: entry.vendorId,
      vendorName: entry.vendor?.name ?? '',
      skuId: entry.skuId,
      price: entry.price,
      leadTimeDays: entry.leadTimeDays,
    };
  }
}
