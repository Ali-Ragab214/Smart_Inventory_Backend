import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { Sku } from '../../sku/entities/sku.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { User, UserRole } from '../../users/entities/user.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { LowStockDetectedEvent } from '../../notifications/events/low-stock-detected.event';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { paginate } from '../../utils/pagination.util';

export interface WarehouseMetrics {
  warehouseId: string;
  units: number;
  stockValue: number;
  targetValue: number;
  coverageValue: number;
  coveragePct: number;
  skuCount: number;
  lowStockCount: number;
  capacityUnits: number | null;
  openOrderCount: number;
  staffCount: number;
}

const OPEN_PO_STATUSES = ['draft', 'pending_approval', 'approved', 'sent'];

@Injectable()
export class StockLevelsService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockLevelRepo: Repository<StockLevel>,
    @InjectRepository(Sku)
    private readonly skuRepo: Repository<Sku>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByWarehouse(
    tenantId: string,
    warehouseId: string,
    query: StockLevelQueryDto,
  ): Promise<{ data: StockLevelResponseDto[]; total: number }> {
    const qb = this.stockLevelRepo
      .createQueryBuilder('sl')
      .innerJoinAndSelect('sl.sku', 'sku')
      .innerJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.warehouseId = :warehouseId', { warehouseId })
      .andWhere('sl.tenantId = :tenantId', { tenantId })
      .orderBy('sl.createdAt', 'DESC');

    if (query.skuId) {
      qb.andWhere('sl.skuId = :skuId', { skuId: query.skuId });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: result.data.map((sl) => this.toResponse(sl)), total: result.total };
  }

  async findLowStock(tenantId: string): Promise<StockLevelResponseDto[]> {
    const levels = await this.stockLevelRepo
      .createQueryBuilder('sl')
      .innerJoinAndSelect('sl.sku', 'sku')
      .innerJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.tenantId = :tenantId', { tenantId })
      .andWhere('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC')
      .getMany();

    return levels.map((sl) => this.toResponse(sl));
  }

  async findAll(tenantId: string, query: StockLevelQueryDto): Promise<{ data: StockLevelResponseDto[]; total: number }> {
    const qb = this.stockLevelRepo
      .createQueryBuilder('sl')
      .innerJoinAndSelect('sl.sku', 'sku')
      .innerJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.tenantId = :tenantId', { tenantId })
      .orderBy('sl.createdAt', 'DESC');

    if (query.warehouseId) {
      qb.andWhere('sl.warehouseId = :warehouseId', { warehouseId: query.warehouseId });
    }
    if (query.skuId) {
      qb.andWhere('sl.skuId = :skuId', { skuId: query.skuId });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: result.data.map((sl) => this.toResponse(sl)), total: result.total };
  }

  async findLowStockByWarehouse(tenantId: string, warehouseId: string): Promise<StockLevelResponseDto[]> {
    const levels = await this.stockLevelRepo
      .createQueryBuilder('sl')
      .innerJoinAndSelect('sl.sku', 'sku')
      .innerJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.warehouseId = :warehouseId', { warehouseId })
      .andWhere('sl.tenantId = :tenantId', { tenantId })
      .andWhere('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC')
      .getMany();

    return levels.map((sl) => this.toResponse(sl));
  }

  async findLowStockForUser(user: User): Promise<StockLevelResponseDto[]> {
    const qb = this.stockLevelRepo
      .createQueryBuilder('sl')
      .innerJoinAndSelect('sl.sku', 'sku')
      .innerJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC');

    if (user.role === UserRole.TENANT) {
      qb.andWhere('warehouse.tenantId = :tenantId', { tenantId: user.tenantId });
    } else if (
      user.role === UserRole.WAREHOUSE_MANAGER ||
      user.role === UserRole.CLERK
    ) {
      if (!user.warehouseId) {
        return [];
      }
      qb.andWhere('sl.warehouseId = :warehouseId', { warehouseId: user.warehouseId });
    } else if (user.role === UserRole.SUPER_ADMIN) {
      // Super admin can see all low stock
    } else {
      throw new ForbiddenException({ message: 'You do not have the required permissions to view low stock alerts.', code: 'FORBIDDEN_LOW_STOCK_VIEW' });
    }

    const levels = await qb.getMany();
    return levels.map((sl) => this.toResponse(sl));
  }

  async getWarehouseMetrics(warehouseIds: string[], tenantId?: string): Promise<WarehouseMetrics[]> {
    const scoped = warehouseIds.length > 0;
    const idScope = scoped ? { warehouseId: In(warehouseIds) } : { tenantId };
    const whScope = scoped ? { id: In(warehouseIds) } : { tenantId };

    const levels = await this.stockLevelRepo.find({
      where: idScope as any,
      relations: ['sku', 'warehouse'],
    });

    const map = new Map<string, WarehouseMetrics>();
    const seed = (warehouseId: string): WarehouseMetrics => {
      let m = map.get(warehouseId);
      if (!m) {
        m = {
          warehouseId,
          units: 0,
          stockValue: 0,
          targetValue: 0,
          coverageValue: 0,
          coveragePct: 0,
          skuCount: 0,
          lowStockCount: 0,
          capacityUnits: null,
          openOrderCount: 0,
          staffCount: 0,
        };
        map.set(warehouseId, m);
      }
      return m;
    };

    for (const sl of levels) {
      if (!sl.sku || sl.sku.deletedAt) continue;
      const price = sl.sku.price;
      const target = sl.reorderThreshold + (sl.safetyStock ?? 0);
      const m = seed(sl.warehouseId);
      m.units += sl.quantity;
      m.stockValue += sl.quantity * price;
      m.targetValue += target * price;
      m.coverageValue += Math.min(sl.quantity, target) * price;
      m.skuCount += 1;
      if (sl.quantity <= sl.reorderThreshold) {
        m.lowStockCount += 1;
      }
    }

    const staffQb = this.userRepo
      .createQueryBuilder('u')
      .select('u."warehouse_id"', 'warehouseId')
      .addSelect('COUNT(*)::int', 'count')
      .andWhere('u."is_active" = true')
      .groupBy('u."warehouse_id"');
    if (scoped) {
      staffQb.where('u."warehouse_id" IN (:...warehouseIds)', { warehouseIds });
    } else {
      staffQb.where('u."tenant_id" = :tenantId', { tenantId });
    }
    for (const row of await staffQb.getRawMany()) {
      const m = row.warehouseId ? map.get(row.warehouseId) : undefined;
      if (m) m.staffCount = Number(row.count) || 0;
    }

    const poQb = this.poRepo
      .createQueryBuilder('po')
      .select('po."warehouse_id"', 'warehouseId')
      .addSelect('COUNT(*)::int', 'count')
      .andWhere('po.status IN (:...statuses)', { statuses: OPEN_PO_STATUSES })
      .groupBy('po."warehouse_id"');
    if (scoped) {
      poQb.where('po."warehouse_id" IN (:...warehouseIds)', { warehouseIds });
    } else {
      poQb.where('po."tenant_id" = :tenantId', { tenantId });
    }
    for (const row of await poQb.getRawMany()) {
      const m = row.warehouseId ? map.get(row.warehouseId) : undefined;
      if (m) m.openOrderCount = Number(row.count) || 0;
    }

    const warehouses = await this.warehouseRepo.find({
      where: whScope as any,
      select: ['id', 'capacityUnits'],
    });
    for (const wh of warehouses) {
      seed(wh.id).capacityUnits = wh.capacityUnits ?? null;
    }

    const list = [...map.values()];
    for (const m of list) {
      // Coverage is capped at 100%: each SKU contributes at most its target value,
      // so excess stock never inflates the reported percentage.
      m.coveragePct = m.targetValue > 0 ? Math.round((m.coverageValue / m.targetValue) * 100) : m.units > 0 ? 100 : 0;
    }
    return list;
  }

  async findOne(tenantId: string, id: string): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id, tenantId },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException({ message: "We couldn't find the stock level information for this item.", code: 'STOCK_LEVEL_NOT_FOUND' });
    }

    return this.toResponse(stockLevel);
  }

  async findOneByWarehouse(tenantId: string, warehouseId: string, id: string): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id, warehouseId, tenantId },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException({ message: "We couldn't find the stock level information for this item.", code: 'STOCK_LEVEL_NOT_FOUND' });
    }

    return this.toResponse(stockLevel);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateStockLevelDto,
  ): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id, tenantId },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException({ message: "We couldn't find the stock level information for this item.", code: 'STOCK_LEVEL_NOT_FOUND' });
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

  async initializeForWarehouse(tenantId: string, warehouseId: string): Promise<number> {
    const existing = await this.stockLevelRepo.find({
      where: { warehouseId, tenantId },
      select: ['skuId'],
    });
    const existingSkuIds = new Set(existing.map((sl) => sl.skuId));

    const allSkus = await this.skuRepo.find({ where: { tenantId }, select: ['id'] });
    const missingSkus = allSkus.filter((s) => !existingSkuIds.has(s.id));

    if (missingSkus.length === 0) return 0;

    const entries = missingSkus.map((sku) =>
      this.stockLevelRepo.create({
        skuId: sku.id,
        warehouseId,
        tenantId,
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

  async autoInitializeForWarehouse(tenantId: string, warehouseId: string): Promise<void> {
    // Disabled auto-initialization of all SKUs for new warehouses
    // await this.initializeForWarehouse(tenantId, warehouseId);
  }

  async initializeSkuForWarehouse(tenantId: string, skuId: string, warehouseId: string): Promise<void> {
    const existing = await this.stockLevelRepo.findOne({
      where: { skuId, warehouseId, tenantId },
    });
    if (!existing) {
      const entry = this.stockLevelRepo.create({
        skuId,
        warehouseId,
        tenantId,
        quantity: 0,
        reorderThreshold: 0,
        safetyStock: 0,
      });
      const saved = await this.stockLevelRepo.save(entry);
      
      this.eventEmitter.emit(
        NotificationEvents.LOW_STOCK_DETECTED,
        new LowStockDetectedEvent(saved.tenantId, {
          skuId: saved.skuId,
          warehouseId: saved.warehouseId,
          quantity: saved.quantity,
          reorderThreshold: saved.reorderThreshold,
          safetyStock: saved.safetyStock,
          detectedAt: new Date().toISOString(),
        })
      );
    }
  }

  async autoInitializeForSku(tenantId: string, skuId: string): Promise<void> {
    const existing = await this.stockLevelRepo.find({
      where: { skuId },
      select: ['warehouseId'],
    });
    const existingWarehouseIds = new Set(existing.map((sl) => sl.warehouseId));

    const allWarehouses = await this.warehouseRepo.find({ 
      where: { tenantId },
      select: ['id', 'tenantId'] 
    });
    const missingWarehouses = allWarehouses.filter((w) => !existingWarehouseIds.has(w.id));

    if (missingWarehouses.length === 0) return;

    const entries = missingWarehouses.map((warehouse) =>
      this.stockLevelRepo.create({
        skuId,
        warehouseId: warehouse.id,
        tenantId: warehouse.tenantId, // Auto inherit tenantId from warehouse
        quantity: 0,
        reorderThreshold: 0,
        safetyStock: 0,
      }),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(StockLevel, entries);
    });

    for (const entry of entries) {
      if (entry.quantity <= entry.reorderThreshold) {
        this.eventEmitter.emit(NotificationEvents.LOW_STOCK_DETECTED, {
          tenantId: entry.tenantId,
          payload: {
            skuId: entry.skuId,
            warehouseId: entry.warehouseId,
            quantity: entry.quantity,
            reorderThreshold: entry.reorderThreshold,
          },
        });
      }
    }
  }

  async autoInitializeForSkus(tenantId: string, skuIds: string[]): Promise<void> {
    if (skuIds.length === 0) return;

    const allWarehouses = await this.warehouseRepo.find({ 
      where: { tenantId },
      select: ['id', 'tenantId'] 
    });
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
              tenantId: warehouse.tenantId,
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
    dto.warehouseLocation = stockLevel.warehouse?.location ?? '';
    dto.quantity = stockLevel.quantity;
    dto.reorderThreshold = stockLevel.reorderThreshold;
    dto.safetyStock = stockLevel.safetyStock;
    dto.createdAt = stockLevel.createdAt;
    dto.updatedAt = stockLevel.updatedAt;
    return dto;
  }
}
