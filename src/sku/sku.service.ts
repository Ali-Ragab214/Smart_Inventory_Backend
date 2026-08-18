import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { Sku } from './entities/sku.entity';
import { StockLevel } from '../inventory/stock-levels/entities/stock-level.entity';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { SkuResponseDto } from './dto/sku-response.dto';
import { SkuMapper } from './mappers/sku.mapper';
import { SkuQueryDto } from './dto/sku-query.dto';
import { CsvImportResponseDto, CsvImportErrorDto } from './dto/csv-import-response.dto';
import { paginate } from '../utils/pagination.util';
import { applySortAndSearch } from '../utils/query.util';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';

import { TenantsService } from '../tenants/tenants.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class SkuService {
  constructor(
    @InjectRepository(Sku)
    private readonly skuRepository: Repository<Sku>,
    private readonly skuMapper: SkuMapper,
    private readonly dataSource: DataSource,
    private readonly stockLevelsService: StockLevelsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async create(tenantId: string, createSkuDto: CreateSkuDto): Promise<SkuResponseDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    const limit = tenant.plan?.maxSkus ?? 10000; // Free trial defaults to Pro
    const currentCount = await this.skuRepository.count({ where: { tenantId } });
    if (limit !== null && currentCount >= limit) {
      throw new ConflictException({ 
        message: `SKU limit reached for your plan (Max ${limit}). Please upgrade to add more SKUs.`, 
        code: 'PLAN_LIMIT_REACHED' 
      });
    }

    const existing = await this.skuRepository.findOne({
      where: { sku: createSkuDto.sku, tenantId },
    });
    if (existing) {
      throw new ConflictException({ message: `The SKU code "${createSkuDto.sku}" is already in use.`, code: 'SKU_IN_USE' });
    }
    const skuEntity = this.skuMapper.toEntity(createSkuDto);
    skuEntity.tenantId = tenantId;
    const savedEntity = await this.skuRepository.save(skuEntity);
    if (createSkuDto.warehouseId) {
      await this.stockLevelsService.initializeSkuForWarehouse(tenantId, savedEntity.id, createSkuDto.warehouseId);
    }
    return this.skuMapper.toResponse(savedEntity);
  }

  async findAll(user: UserResponseDto, query: SkuQueryDto): Promise<{ data: SkuResponseDto[]; total: number }> {
    const qb = this.skuRepository.createQueryBuilder('sku')
      .where('sku.tenantId = :tenantId', { tenantId: user.tenantId });

    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      qb.innerJoin(
        'stock_levels',
        'sl',
        'sl.sku_id = sku.id AND sl.warehouse_id = :warehouseId',
        { warehouseId: user.warehouseId },
      );
    } else if (query.warehouseId) {
      qb.innerJoin(
        'stock_levels',
        'sl',
        'sl.sku_id = sku.id AND sl.warehouse_id = :warehouseId',
        { warehouseId: query.warehouseId },
      );
    }

    applySortAndSearch(qb, 'sku', query.sortBy, query.sortOrder, query.search, ['name', 'sku']);
    
    if (query.categoryId) {
      qb.andWhere('sku.categoryId = :categoryId', { categoryId: query.categoryId });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.skuMapper.toResponseList(result.data), total: result.total };
  }

  async findOne(tenantId: string, id: string): Promise<SkuResponseDto> {
    const skuEntity = await this.skuRepository.findOne({ where: { id, tenantId } });
    if (!skuEntity) {
      throw new NotFoundException({ message: 'The specified product (SKU) does not exist.', code: 'SKU_NOT_FOUND' });
    }
    return this.skuMapper.toResponse(skuEntity);
  }

  async update(tenantId: string, id: string, updateSkuDto: UpdateSkuDto): Promise<SkuResponseDto> {
    const skuEntity = await this.skuRepository.findOne({ where: { id, tenantId } });
    if (!skuEntity) {
      throw new NotFoundException({ message: 'The specified product (SKU) does not exist.', code: 'SKU_NOT_FOUND' });
    }

    if (updateSkuDto.sku && updateSkuDto.sku !== skuEntity.sku) {
      const existing = await this.skuRepository.findOne({
        where: { sku: updateSkuDto.sku, tenantId },
      });
      if (existing) {
        throw new ConflictException({ message: `The SKU code "${updateSkuDto.sku}" is already in use.`, code: 'SKU_IN_USE' });
      }
    }

    const updatedEntity = this.skuMapper.updateEntity(skuEntity, updateSkuDto);
    const savedEntity = await this.skuRepository.save(updatedEntity);
    return this.skuMapper.toResponse(savedEntity);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const skuEntity = await this.skuRepository.findOne({ where: { id, tenantId } });
    if (!skuEntity) {
      throw new NotFoundException({ message: 'The specified product (SKU) does not exist.', code: 'SKU_NOT_FOUND' });
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Sku, { id, tenantId });
      await manager.softDelete(StockLevel, { skuId: id, tenantId });
    });
  }

  async importCsv(tenantId: string, buffer: Buffer): Promise<CsvImportResponseDto> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException({ message: 'The uploaded CSV file appears to be empty.', code: 'EMPTY_CSV_FILE' });
    }

    let records: Record<string, string>[];
    try {
      // Strip UTF-8 BOM if present
      const content = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
        ? buffer.toString('utf-8', 3)
        : buffer.toString('utf-8');

      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch {
      throw new BadRequestException({ message: 'The uploaded CSV file is improperly formatted. Please check its contents and try again.', code: 'MALFORMED_CSV' });
    }

    if (records.length === 0) {
      throw new BadRequestException({ message: 'The uploaded CSV file does not contain any data rows to process.', code: 'NO_DATA_IN_CSV' });
    }

    const errors: CsvImportErrorDto[] = [];
    const toCreate: CreateSkuDto[] = [];
    const seenInCsv = new Set<string>();
    const rowNumberOffset = 2; // header = row 1, first data row = row 2

    // Collect all sku codes from CSV for batch DB check
    const csvSkuCodes = records
      .map((r) => (r.skuCode ?? '').trim().toUpperCase())
      .filter(Boolean);

    const existing = csvSkuCodes.length > 0
      ? await this.skuRepository.find({
          where: csvSkuCodes.map((code) => ({ sku: code, tenantId })),
        })
      : [];

    const existingSet = new Set(existing.map((s) => s.sku));

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + rowNumberOffset;
      const rawSkuCode = (row.skuCode ?? '').trim();
      const skuCode = rawSkuCode.toUpperCase();
      const name = (row.name ?? '').trim();
      const rawCost = (row.costPrice ?? '').trim();
      const rawPrice = (row.sellingPrice ?? '').trim();

      // Validate required fields
      let hasError = false;

      if (!skuCode) {
        errors.push({ row: rowNum, skuCode: null, message: 'skuCode is required' });
        hasError = true;
      }
      if (!name) {
        errors.push({ row: rowNum, skuCode: skuCode || null, message: 'name is required' });
        hasError = true;
      }

      const cost = Number(rawCost);
      const price = Number(rawPrice);

      if (!rawCost || isNaN(cost) || cost <= 0) {
        errors.push({ row: rowNum, skuCode: skuCode || null, message: `Invalid costPrice value: "${rawCost}"` });
        hasError = true;
      }
      if (!rawPrice || isNaN(price) || price <= 0) {
        errors.push({ row: rowNum, skuCode: skuCode || null, message: `Invalid sellingPrice value: "${rawPrice}"` });
        hasError = true;
      }

      if (hasError) continue;

      // Check duplicate within CSV
      if (seenInCsv.has(skuCode)) {
        errors.push({ row: rowNum, skuCode: skuCode, message: `Duplicate SKU code "${skuCode}" found in CSV file` });
        continue;
      }
      seenInCsv.add(skuCode);

      // Check duplicate in DB
      if (existingSet.has(skuCode)) {
        errors.push({ row: rowNum, skuCode: skuCode, message: `SKU code "${skuCode}" already exists` });
        continue;
      }

      // Only add to DB existence check set once we know it's valid
      existingSet.add(skuCode);

      toCreate.push({
        sku: skuCode,
        name,
        cost,
        price,
      });
    }

    // Batch insert valid SKUs
    let successful = 0;
    const createdIds: string[] = [];
    if (toCreate.length > 0) {
      const tenant = await this.tenantsService.findById(tenantId);
      const limit = tenant.plan?.maxSkus ?? 10000;
      const currentCount = await this.skuRepository.count({ where: { tenantId } });
      
      if (limit !== null && currentCount + toCreate.length > limit) {
        throw new ConflictException({ 
          message: `Importing these SKUs would exceed your plan limit of ${limit} SKUs (Current: ${currentCount}, Importing: ${toCreate.length}). Please upgrade your plan.`, 
          code: 'PLAN_LIMIT_REACHED' 
        });
      }

      await this.dataSource.transaction(async (manager) => {
        const entities = toCreate.map((dto) => {
          const e = this.skuMapper.toEntity(dto);
          e.tenantId = tenantId;
          return e;
        });
        const saved = await manager.save(Sku, entities);
        successful = entities.length;
        createdIds.push(...saved.map((s) => s.id));
      });
    }

    // Auto-initialize stock levels for all newly created SKUs
    if (createdIds.length > 0) {
      await this.stockLevelsService.autoInitializeForSkus(tenantId, createdIds);
    }

    return {
      totalRows: records.length,
      successful,
      failed: errors.length,
      errors,
    };
  }

  async exportCsv(tenantId: string): Promise<string> {
    const rows = await this.skuRepository
      .createQueryBuilder('sku')
      .leftJoin('sku.category', 'category')
      .leftJoin('sku.preferredVendor', 'vendor')
      .select([
        'sku.sku AS "skuCode"',
        'sku.name AS "name"',
        'category.name AS "categoryName"',
        'sku.cost AS "costPrice"',
        'sku.price AS "sellingPrice"',
        'vendor.name AS "vendorName"',
      ])
      .where('sku.tenantId = :tenantId', { tenantId })
      .orderBy('sku.name', 'ASC')
      .getRawMany();

    const escape = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const header = ['skuCode', 'name', 'categoryName', 'costPrice', 'sellingPrice', 'vendorName'];
    const lines = rows.map((row) =>
      [
        row.skuCode,
        row.name,
        row.categoryName,
        row.costPrice,
        row.sellingPrice,
        row.vendorName,
      ]
        .map(escape)
        .join(','),
    );

    return [header.map(escape).join(','), ...lines].join('\r\n');
  }
}
