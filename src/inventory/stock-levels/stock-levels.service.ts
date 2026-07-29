import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { Sku } from '../../sku/entities/sku.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { User, UserRole } from '../../users/entities/user.entity';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { paginate } from '../../utils/pagination.util';

@Injectable()
export class StockLevelsService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockLevelRepo: Repository<StockLevel>,
    @InjectRepository(Sku)
    private readonly skuRepo: Repository<Sku>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    private readonly dataSource: DataSource,
  ) {}

  async findByWarehouse(
    warehouseId: string,
    query: StockLevelQueryDto,
  ): Promise<{ data: StockLevelResponseDto[]; total: number }> {
    const qb = this.stockLevelRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.warehouseId = :warehouseId', { warehouseId })
      .orderBy('sl.createdAt', 'DESC');

    if (query.skuId) {
      qb.andWhere('sl.skuId = :skuId', { skuId: query.skuId });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: result.data.map((sl) => this.toResponse(sl)), total: result.total };
  }

  async findLowStock(): Promise<StockLevelResponseDto[]> {
    const levels = await this.stockLevelRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC')
      .getMany();

    return levels.map((sl) => this.toResponse(sl));
  }

  async findLowStockByWarehouse(warehouseId: string): Promise<StockLevelResponseDto[]> {
    const levels = await this.stockLevelRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.warehouseId = :warehouseId', { warehouseId })
      .andWhere('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC')
      .getMany();

    return levels.map((sl) => this.toResponse(sl));
  }

  async findLowStockForUser(user: User): Promise<StockLevelResponseDto[]> {
    const qb = this.stockLevelRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC');

    if (user.role === UserRole.TENANT_OWNER) {
      qb.andWhere('warehouse.tenantId = :userId', { userId: user.id });
    } else if (
      user.role === UserRole.WAREHOUSE_MANAGER ||
      user.role === UserRole.INVENTORY_CLERK
    ) {
      if (!user.warehouseId) {
        return [];
      }
      qb.andWhere('sl.warehouseId = :warehouseId', { warehouseId: user.warehouseId });
    } else if (user.role === UserRole.SUPER_ADMIN) {
      // Super admin can see all low stock
    } else {
      throw new ForbiddenException('You do not have permission to view low stock data');
    }

    const levels = await qb.getMany();
    return levels.map((sl) => this.toResponse(sl));
  }

  async findOne(id: string): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException(`Stock level with ID "${id}" not found`);
    }

    return this.toResponse(stockLevel);
  }

  async findOneByWarehouse(warehouseId: string, id: string): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id, warehouseId },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException(`Stock level with ID "${id}" not found in this warehouse`);
    }

    return this.toResponse(stockLevel);
  }

  async update(
    id: string,
    dto: UpdateStockLevelDto,
  ): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException(`Stock level with ID "${id}" not found`);
    }

    if (dto.reorderThreshold !== undefined) {
      stockLevel.reorderThreshold = dto.reorderThreshold;
    }
    if (dto.safetyStock !== undefined) {
      stockLevel.safetyStock = dto.safetyStock;
    }

    await this.stockLevelRepo.save(stockLevel);
    return this.toResponse(stockLevel);
  }

  async initializeForWarehouse(warehouseId: string): Promise<number> {
    const existing = await this.stockLevelRepo.find({
      where: { warehouseId },
      select: ['skuId'],
    });
    const existingSkuIds = new Set(existing.map((sl) => sl.skuId));

    const allSkus = await this.skuRepo.find({ select: ['id'] });
    const missingSkus = allSkus.filter((s) => !existingSkuIds.has(s.id));

    if (missingSkus.length === 0) return 0;

    const entries = missingSkus.map((sku) =>
      this.stockLevelRepo.create({
        skuId: sku.id,
        warehouseId,
        quantity: 0,
        reorderThreshold: 0,
        safetyStock: 0,
      }),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(StockLevel, entries);
    });

    return entries.length;
  }

  async autoInitializeForWarehouse(warehouseId: string): Promise<void> {
    await this.initializeForWarehouse(warehouseId);
  }

  async autoInitializeForSku(skuId: string): Promise<void> {
    const existing = await this.stockLevelRepo.find({
      where: { skuId },
      select: ['warehouseId'],
    });
    const existingWarehouseIds = new Set(existing.map((sl) => sl.warehouseId));

    const allWarehouses = await this.warehouseRepo.find({ select: ['id'] });
    const missingWarehouses = allWarehouses.filter((w) => !existingWarehouseIds.has(w.id));

    if (missingWarehouses.length === 0) return;

    const entries = missingWarehouses.map((warehouse) =>
      this.stockLevelRepo.create({
        skuId,
        warehouseId: warehouse.id,
        quantity: 0,
        reorderThreshold: 0,
        safetyStock: 0,
      }),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(StockLevel, entries);
    });
  }

  async autoInitializeForSkus(skuIds: string[]): Promise<void> {
    if (skuIds.length === 0) return;

    const allWarehouses = await this.warehouseRepo.find({ select: ['id'] });
    if (allWarehouses.length === 0) return;

    const existing = await this.stockLevelRepo.find({
      where: { skuId: In(skuIds) },
      select: ['skuId', 'warehouseId'],
    });
    const existingSet = new Set(existing.map((sl) => `${sl.skuId}:${sl.warehouseId}`));

    const entries: StockLevel[] = [];
    for (const skuId of skuIds) {
      for (const warehouse of allWarehouses) {
        if (!existingSet.has(`${skuId}:${warehouse.id}`)) {
          entries.push(
            this.stockLevelRepo.create({
              skuId,
              warehouseId: warehouse.id,
              quantity: 0,
              reorderThreshold: 0,
              safetyStock: 0,
            }),
          );
        }
      }
    }

    if (entries.length === 0) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(StockLevel, entries);
    });
  }

  private toResponse(stockLevel: StockLevel): StockLevelResponseDto {
    const dto = new StockLevelResponseDto();
    dto.id = stockLevel.id;
    dto.skuId = stockLevel.skuId;
    dto.skuName = stockLevel.sku?.name ?? '';
    dto.warehouseId = stockLevel.warehouseId;
    dto.warehouseName = stockLevel.warehouse?.name ?? '';
    dto.quantity = stockLevel.quantity;
    dto.reorderThreshold = stockLevel.reorderThreshold;
    dto.safetyStock = stockLevel.safetyStock;
    dto.createdAt = stockLevel.createdAt;
    dto.updatedAt = stockLevel.updatedAt;
    return dto;
  }
}
