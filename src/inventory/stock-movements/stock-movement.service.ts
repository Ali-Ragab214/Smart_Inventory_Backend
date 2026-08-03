import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockMovement } from './entities/stock-movement.entity';
import { StockLevel } from '../stock-levels/entities/stock-level.entity';
import { MovementReason } from './enums/movement-reason.enum';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { StockMovementResponseDto } from './dto/stock-movement-response.dto';
import { StockMovementMapper } from './mappers/stock-movement.mapper';
import { paginate } from '../../utils/pagination.util';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { LowStockDetectedEvent } from '../../notifications/events/low-stock-detected.event';

export interface RecordMovementParams {
  skuId: string;
  warehouseId: string;
  reason: MovementReason;
  quantityChange: number;
  /** Caller-supplied unique key — duplicate submissions are silently deduplicated. */
  idempotencyKey: string;
  performedByUserId?: string;
  performedByAgent?: string;
  referenceType?: string;
  referenceId?: string;
  note?: string;
}

//  Reconciliation result type

export interface ReconciliationResult {
  skuId: string;
  warehouseId: string;
  /** Value currently stored in the StockLevel (the denormalized cache). */
  cached: number;
  /** SUM(quantityChange) recomputed directly from the ledger. */
  calculated: number;
  /** True when cached === calculated — the cache is consistent. */
  matches: boolean;
}

//  Daily consumption series row

export interface DailyConsumptionRow {
  /** Calendar date (YYYY-MM-DD) */
  day: string;
  /** Net quantity change for that day (positive or negative). */
  netChange: number;
}

@Injectable()
export class StockMovementService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,

    @InjectRepository(StockLevel)
    private readonly stockLevelRepo: Repository<StockLevel>,

    private readonly dataSource: DataSource,

    private readonly mapper: StockMovementMapper,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * The ONE authoritative method for changing stock levels.
   *
   * Must be called instead of updating `StockLevel.quantity` directly anywhere
   * in the system.  Guarantees:
   *
   * 1. Idempotency   — duplicate idempotencyKey → same response, no extra row.
   * 2. Atomicity     — StockLevel balance update and ledger insert happen in one TX.
   * 3. Consistency   — pessimistic lock on the StockLevel row prevents concurrent
   *                    double-counting for the same SKU in the same warehouse.
   * 4. Non-negative  — rejects any movement that would drop stock below zero.
   */
  async recordMovement(
    tenantId: string,
    params: RecordMovementParams,
  ): Promise<StockMovementResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const movRepo = manager.getRepository(StockMovement);
      const slRepo = manager.getRepository(StockLevel);

      // Step 1: Idempotency check
      const existing = await movRepo.findOne({
        where: { idempotencyKey: params.idempotencyKey, tenantId },
      });
      if (existing) {
        return this.mapper.toResponse(existing);
      }

      // Step 2: Lock the StockLevel row
      let stockLevel = await slRepo.findOne({
        where: { skuId: params.skuId, warehouseId: params.warehouseId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      // Step 3: Auto-create StockLevel if none exists (first movement for this sku+warehouse)
      if (!stockLevel) {
        stockLevel = slRepo.create({
          skuId: params.skuId,
          warehouseId: params.warehouseId,
          tenantId,
          quantity: 0,
          reorderThreshold: 0,
          safetyStock: 0,
        });
        stockLevel = await slRepo.save(stockLevel);
      }

      // Step 4: Compute new balance
      const newBalance = stockLevel.quantity + params.quantityChange;

      // Step 5: Guard against negative stock
      if (newBalance < 0) {
        throw new BadRequestException({ message: `Movement would result in negative stock (current: ${stockLevel.quantity}, change: ${params.quantityChange}).`, code: 'INSUFFICIENT_STOCK' });
      }

      // Step 6: Insert the ledger row
      const movement = movRepo.create({
        skuId: params.skuId,
        warehouseId: params.warehouseId,
        tenantId,
        reason: params.reason,
        quantityChange: params.quantityChange,
        balanceAfter: newBalance,
        idempotencyKey: params.idempotencyKey,
        performedByUserId: params.performedByUserId ?? null,
        performedByAgent: params.performedByAgent ?? null,
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
        note: params.note ?? null,
      });
      const saved = await movRepo.save(movement);

      // Step 7: Update the denormalized cache on the StockLevel
      stockLevel.quantity = newBalance;
      await slRepo.save(stockLevel);

      // Step 7b: Emit low-stock event when quantity crosses the reorder threshold
      if (stockLevel.reorderThreshold > 0 && newBalance <= stockLevel.reorderThreshold) {
        this.eventEmitter.emit(
          NotificationEvents.LOW_STOCK_DETECTED,
          new LowStockDetectedEvent(tenantId, {
            skuId: params.skuId,
            warehouseId: params.warehouseId,
            quantity: newBalance,
            reorderThreshold: stockLevel.reorderThreshold,
            safetyStock: stockLevel.safetyStock,
            detectedAt: new Date().toISOString(),
          }),
        );
      }

      // Step 8: Return mapped response
      return this.mapper.toResponse(saved);
    });
  }

  //  Recent movements across all SKUs (for dashboards)

  /**
   * Returns the most recent movements, optionally filtered by warehouse.
   */
  async getRecentMovements(
    tenantId: string,
    warehouseId?: string,
    limit: number = 10,
  ): Promise<StockMovementResponseDto[]> {
    const qb = this.movementRepo
      .createQueryBuilder('sm')
      .leftJoinAndSelect('sm.sku', 'sku')
      .where('sm.tenantId = :tenantId', { tenantId })
      .orderBy('sm.createdAt', 'DESC');

    if (warehouseId) {
      qb.andWhere('sm.warehouseId = :warehouseId', { warehouseId });
    }

    const result = await qb.take(limit).getMany();
    return this.mapper.toResponseList(result);
  }

  //  Per-SKU history (read path)

  /**
   * Returns paginated movement history for a single SKU, newest-first.
   * Filterable by date range and movement reason.
   */
  async getHistoryForSku(
    tenantId: string,
    skuId: string,
    query: StockMovementQueryDto,
  ): Promise<{ data: StockMovementResponseDto[]; total: number }> {
    const qb = this.movementRepo
      .createQueryBuilder('sm')
      .where('sm.skuId = :skuId', { skuId })
      .andWhere('sm.tenantId = :tenantId', { tenantId })
      .orderBy('sm.createdAt', 'DESC');

    if (query.from) {
      qb.andWhere('sm.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('sm.createdAt <= :to', { to: new Date(query.to) });
    }
    if (query.reason) {
      qb.andWhere('sm.reason = :reason', { reason: query.reason });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.mapper.toResponseList(result.data), total: result.total };
  }

  //  Integrity reconciliation

  /**
   * Integrity-check utility: recomputes the true stock balance by summing
   * every ledger row for the SKU and compares it against the denormalized
   * cache in `StockLevel.quantity`.
   *
   * NOT on the hot path — call manually / from an admin job.
   */
  async reconcileBalance(tenantId: string, skuId: string, warehouseId: string): Promise<ReconciliationResult> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { skuId, warehouseId, tenantId },
    });
    if (!stockLevel) {
      throw new NotFoundException({ message: "We couldn't find the stock level information for this item.", code: 'STOCK_LEVEL_NOT_FOUND' });
    }

    const result = await this.movementRepo
      .createQueryBuilder('sm')
      .select('COALESCE(SUM(sm.quantityChange), 0)', 'total')
      .where('sm.skuId = :skuId', { skuId })
      .andWhere('sm.warehouseId = :warehouseId', { warehouseId })
      .andWhere('sm.tenantId = :tenantId', { tenantId })
      .getRawOne<{ total: string }>();

    const calculated = parseInt(result?.total ?? '0', 10);

    return {
      skuId,
      warehouseId,
      cached: stockLevel.quantity,
      calculated,
      matches: stockLevel.quantity === calculated,
    };
  }

  //  Transfer between warehouses

  async transfer(tenantId: string, params: {
    skuId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    idempotencyKey: string;
    performedByUserId?: string;
    note?: string;
  }): Promise<{ out: StockMovementResponseDto; in: StockMovementResponseDto }> {
    if (params.fromWarehouseId === params.toWarehouseId) {
      throw new BadRequestException({ message: 'You cannot transfer stock to the same warehouse.', code: 'SAME_SOURCE_DEST_WAREHOUSE' });
    }
    if (params.quantity <= 0) {
      throw new BadRequestException({ message: 'The transfer quantity must be greater than zero.', code: 'INVALID_TRANSFER_QUANTITY' });
    }

    return this.dataSource.transaction(async (manager) => {
      const movRepo = manager.getRepository(StockMovement);
      const slRepo = manager.getRepository(StockLevel);

      const existing = await movRepo.findOne({
        where: { idempotencyKey: params.idempotencyKey, tenantId },
      });
      if (existing) {
        const partnerKey = `${params.idempotencyKey}-partner`;
        const partner = await movRepo.findOne({
          where: { idempotencyKey: partnerKey, tenantId },
        });
        const out = this.mapper.toResponse(existing);
        const inbound = partner ? this.mapper.toResponse(partner) : null as any;
        return { out, in: inbound };
      }

      const outKey = params.idempotencyKey;
      const inKey = `${params.idempotencyKey}-partner`;

      // Lock both stock levels
      let sourceSl = await slRepo.findOne({
        where: { skuId: params.skuId, warehouseId: params.fromWarehouseId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sourceSl) {
        throw new NotFoundException({ message: "We couldn't find the stock level information for this item in the source warehouse.", code: 'STOCK_LEVEL_NOT_FOUND' });
      }

      let destSl = await slRepo.findOne({
        where: { skuId: params.skuId, warehouseId: params.toWarehouseId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!destSl) {
        destSl = slRepo.create({
          skuId: params.skuId,
          warehouseId: params.toWarehouseId,
          tenantId,
          quantity: 0,
          reorderThreshold: 0,
          safetyStock: 0,
        });
        destSl = await slRepo.save(destSl);
      }

      const newSourceBalance = sourceSl.quantity - params.quantity;
      if (newSourceBalance < 0) {
        throw new BadRequestException({ message: `Insufficient stock in source warehouse (available: ${sourceSl.quantity}, transfer: ${params.quantity})`, code: 'INSUFFICIENT_STOCK' });
      }
      const newDestBalance = destSl.quantity + params.quantity;

      // OUT movement
      const outMovement = movRepo.create({
        skuId: params.skuId,
        warehouseId: params.fromWarehouseId,
        tenantId,
        reason: MovementReason.TRANSFER_OUT,
        quantityChange: -params.quantity,
        balanceAfter: newSourceBalance,
        idempotencyKey: outKey,
        performedByUserId: params.performedByUserId ?? null,
        note: params.note ?? null,
      });
      const savedOut = await movRepo.save(outMovement);

      // IN movement
      const inMovement = movRepo.create({
        skuId: params.skuId,
        warehouseId: params.toWarehouseId,
        tenantId,
        reason: MovementReason.TRANSFER_IN,
        quantityChange: params.quantity,
        balanceAfter: newDestBalance,
        idempotencyKey: inKey,
        performedByUserId: params.performedByUserId ?? null,
        note: params.note ?? null,
      });
      const savedIn = await movRepo.save(inMovement);

      // Update stock levels
      sourceSl.quantity = newSourceBalance;
      await slRepo.save(sourceSl);
      destSl.quantity = newDestBalance;
      await slRepo.save(destSl);

      // Emit low-stock event when the source warehouse crosses the threshold
      if (sourceSl.reorderThreshold > 0 && newSourceBalance <= sourceSl.reorderThreshold) {
        this.eventEmitter.emit(
          NotificationEvents.LOW_STOCK_DETECTED,
          new LowStockDetectedEvent(tenantId, {
            skuId: params.skuId,
            warehouseId: params.fromWarehouseId,
            quantity: newSourceBalance,
            reorderThreshold: sourceSl.reorderThreshold,
            safetyStock: sourceSl.safetyStock,
            detectedAt: new Date().toISOString(),
          }),
        );
      }

      return {
        out: this.mapper.toResponse(savedOut),
        in: this.mapper.toResponse(savedIn),
      };
    });
  }

  //  Demand-forecasting data feed

  /**
   * Returns daily net quantity changes over the last `sinceDays` calendar days
   * for the given SKU in a given warehouse.
   *
   * This raw aggregation is the data source for a future Demand Forecasting
   * feature.  No forecasting logic is implemented here — just the data method.
   *
   * Results are ordered oldest-first so callers can feed them directly into
   * a time-series model.
   */
  async getConsumptionSeries(
    tenantId: string,
    skuId: string,
    warehouseId: string,
    sinceDays: number,
  ): Promise<DailyConsumptionRow[]> {
    const rows = await this.movementRepo
      .createQueryBuilder('sm')
      .select("TO_CHAR(sm.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')", 'day')
      .addSelect('SUM(sm.quantityChange)', 'netChange')
      .where('sm.skuId = :skuId', { skuId })
      .andWhere('sm.warehouseId = :warehouseId', { warehouseId })
      .andWhere('sm.tenantId = :tenantId', { tenantId })
      .andWhere(
        "sm.createdAt >= NOW() - (:sinceDays * INTERVAL '1 day')",
        { sinceDays },
      )
      .groupBy("TO_CHAR(sm.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')")
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; netChange: string }>();

    return rows.map((r) => ({
      day: r.day,
      netChange: parseInt(r.netChange, 10),
    }));
  }
}
