import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { Sku } from './entities/sku.entity';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { SkuResponseDto } from './dto/sku-response.dto';
import { SkuMapper } from './mappers/sku.mapper';
import { SkuQueryDto } from './dto/sku-query.dto';
import { CsvImportResponseDto, CsvImportErrorDto } from './dto/csv-import-response.dto';
import { paginate } from '../utils/pagination.util';
import { applySortAndSearch } from '../utils/query.util';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';

@Injectable()
export class SkuService {
  constructor(
    @InjectRepository(Sku)
    private readonly skuRepository: Repository<Sku>,
    private readonly skuMapper: SkuMapper,
    private readonly dataSource: DataSource,
    private readonly stockLevelsService: StockLevelsService,
  ) {}

  async create(createSkuDto: CreateSkuDto): Promise<SkuResponseDto> {
    const existing = await this.skuRepository.findOne({
      where: { sku: createSkuDto.sku },
    });
    if (existing) {
      throw new ConflictException(
        `SKU "${createSkuDto.sku}" already exists`,
      );
    }
    const skuEntity = this.skuMapper.toEntity(createSkuDto);
    const savedEntity = await this.skuRepository.save(skuEntity);
    await this.stockLevelsService.autoInitializeForSku(savedEntity.id);
    return this.skuMapper.toResponse(savedEntity);
  }

  async findAll(query: SkuQueryDto): Promise<{ data: SkuResponseDto[]; total: number }> {
    const qb = this.skuRepository.createQueryBuilder('sku');
    applySortAndSearch(qb, 'sku', query.sortBy, query.sortOrder, query.search, ['name', 'sku']);
    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.skuMapper.toResponseList(result.data), total: result.total };
  }

  async findOne(id: string): Promise<SkuResponseDto> {
    const skuEntity = await this.skuRepository.findOne({ where: { id } });
    if (!skuEntity) {
      throw new NotFoundException(`SKU with ID "${id}" not found`);
    }
    return this.skuMapper.toResponse(skuEntity);
  }

  async update(id: string, updateSkuDto: UpdateSkuDto): Promise<SkuResponseDto> {
    const skuEntity = await this.skuRepository.findOne({ where: { id } });
    if (!skuEntity) {
      throw new NotFoundException(`SKU with ID "${id}" not found`);
    }

    if (updateSkuDto.sku && updateSkuDto.sku !== skuEntity.sku) {
      const existing = await this.skuRepository.findOne({
        where: { sku: updateSkuDto.sku },
      });
      if (existing) {
        throw new ConflictException(
          `SKU "${updateSkuDto.sku}" already exists`,
        );
      }
    }

    const updatedEntity = this.skuMapper.updateEntity(skuEntity, updateSkuDto);
    const savedEntity = await this.skuRepository.save(updatedEntity);
    return this.skuMapper.toResponse(savedEntity);
  }

  async remove(id: string): Promise<void> {
    const skuEntity = await this.skuRepository.findOne({ where: { id } });
    if (!skuEntity) {
      throw new NotFoundException(`SKU with ID "${id}" not found`);
    }
    await this.skuRepository.softRemove(skuEntity);
  }

  async importCsv(buffer: Buffer): Promise<CsvImportResponseDto> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('CSV file is empty');
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
      throw new BadRequestException('Malformed CSV file');
    }

    if (records.length === 0) {
      throw new BadRequestException('CSV file contains no data rows');
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
          where: csvSkuCodes.map((code) => ({ sku: code })),
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
      await this.dataSource.transaction(async (manager) => {
        const entities = toCreate.map((dto) => this.skuMapper.toEntity(dto));
        const saved = await manager.save(Sku, entities);
        successful = entities.length;
        createdIds.push(...saved.map((s) => s.id));
      });
    }

    // Auto-initialize stock levels for all newly created SKUs
    if (createdIds.length > 0) {
      await this.stockLevelsService.autoInitializeForSkus(createdIds);
    }

    return {
      totalRows: records.length,
      successful,
      failed: errors.length,
      errors,
    };
  }
}
