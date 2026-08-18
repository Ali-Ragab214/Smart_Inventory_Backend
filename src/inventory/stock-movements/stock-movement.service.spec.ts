import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StockMovementService } from './stock-movement.service';
import { StockMovement } from './entities/stock-movement.entity';
import { StockLevel } from '../stock-levels/entities/stock-level.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { StockMovementMapper } from './mappers/stock-movement.mapper';
import { MovementReason } from './enums/movement-reason.enum';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let mockDataSource: any;

  const TENANT_ID = 'tenant-uuid';

  const mockMovRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => ({ id: 'mock-movement-id', createdAt: new Date(), ...data })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(),
  };

  const mockStockLevelRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    })),
  };

  const mockWarehouseRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'wh-uuid', capacityUnits: null }),
  };

  const mockEntityManager = {
    getRepository: jest.fn((entityClass) => {
      if (entityClass === StockMovement) return mockMovRepo;
      if (entityClass === StockLevel) return mockStockLevelRepo;
      if (entityClass === Warehouse) return mockWarehouseRepo;
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource = {
      transaction: jest.fn((cb) => cb(mockEntityManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        StockMovementMapper,
        {
          provide: getRepositoryToken(StockMovement),
          useValue: mockMovRepo,
        },
        {
          provide: getRepositoryToken(StockLevel),
          useValue: mockStockLevelRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<StockMovementService>(StockMovementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordMovement', () => {
    const params = {
      skuId: 'sku-uuid',
      warehouseId: 'wh-uuid',
      reason: MovementReason.PURCHASE_ORDER_RECEIPT,
      quantityChange: 10,
      idempotencyKey: 'idem-key-123',
      performedByUserId: 'user-uuid',
      note: 'PO received',
    };

    it('should return existing movement if idempotency key is already used (idempotent no-op)', async () => {
      const existingMovement = {
        id: 'existing-id',
        skuId: 'sku-uuid',
        warehouseId: 'wh-uuid',
        reason: MovementReason.PURCHASE_ORDER_RECEIPT,
        quantityChange: 10,
        balanceAfter: 15,
        idempotencyKey: 'idem-key-123',
        createdAt: new Date(),
      };
      mockMovRepo.findOne.mockResolvedValue(existingMovement);

      const result = await service.recordMovement(TENANT_ID, params);

      expect(mockMovRepo.findOne).toHaveBeenCalledWith({
        where: { idempotencyKey: 'idem-key-123', tenantId: TENANT_ID },
      });
      expect(mockStockLevelRepo.findOne).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-id');
      expect(result.balanceAfter).toBe(15);
    });

    it('should auto-create StockLevel if none exists (first movement for sku+warehouse)', async () => {
      mockMovRepo.findOne.mockResolvedValue(null);
      mockStockLevelRepo.findOne.mockResolvedValue(null);

      const result = await service.recordMovement(TENANT_ID, params);

      expect(mockStockLevelRepo.create).toHaveBeenCalledWith({
        skuId: 'sku-uuid',
        warehouseId: 'wh-uuid',
        tenantId: TENANT_ID,
        quantity: 0,
        reorderThreshold: 0,
        safetyStock: 0,
      });
      expect(mockStockLevelRepo.save).toHaveBeenCalled();
      expect(result.skuId).toBe('sku-uuid');
      expect(result.warehouseId).toBe('wh-uuid');
    });

    it('should throw BadRequestException if new balance would be negative', async () => {
      const mockStockLevel = { id: 'sl-uuid', skuId: 'sku-uuid', warehouseId: 'wh-uuid', quantity: 5 };
      mockMovRepo.findOne.mockResolvedValue(null);
      mockStockLevelRepo.findOne.mockResolvedValue(mockStockLevel);

      const negativeParams = { ...params, quantityChange: -10 };

      await expect(service.recordMovement(TENANT_ID, negativeParams)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if movement would exceed warehouse capacity', async () => {
      const mockStockLevel = { id: 'sl-uuid', skuId: 'sku-uuid', warehouseId: 'wh-uuid', quantity: 5 };
      mockMovRepo.findOne.mockResolvedValue(null);
      mockStockLevelRepo.findOne.mockResolvedValue(mockStockLevel);
      mockWarehouseRepo.findOne.mockResolvedValue({ id: 'wh-uuid', capacityUnits: 10 });
      mockStockLevelRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '10' }),
      });

      await expect(service.recordMovement(TENANT_ID, params)).rejects.toThrow(BadRequestException);
      await expect(service.recordMovement(TENANT_ID, params)).rejects.toMatchObject({
        response: { code: 'WAREHOUSE_CAPACITY_EXCEEDED' },
      });
    });

    it('should allow movement when warehouse still has capacity', async () => {
      const mockStockLevel = { id: 'sl-uuid', skuId: 'sku-uuid', warehouseId: 'wh-uuid', quantity: 5 };
      mockMovRepo.findOne.mockResolvedValue(null);
      mockStockLevelRepo.findOne.mockResolvedValue(mockStockLevel);
      mockWarehouseRepo.findOne.mockResolvedValue({ id: 'wh-uuid', capacityUnits: 20 });
      mockStockLevelRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '5' }),
      });

      const result = await service.recordMovement(TENANT_ID, params);

      expect(result.balanceAfter).toBe(15);
      expect(mockWarehouseRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'wh-uuid', tenantId: TENANT_ID },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('should successfully record movement and update StockLevel balance', async () => {
      const mockStockLevel = { id: 'sl-uuid', skuId: 'sku-uuid', warehouseId: 'wh-uuid', quantity: 5 };
      mockMovRepo.findOne.mockResolvedValue(null);
      mockStockLevelRepo.findOne.mockResolvedValue(mockStockLevel);

      const result = await service.recordMovement(TENANT_ID, params);

      expect(mockStockLevel.quantity).toBe(15);
      expect(mockStockLevelRepo.save).toHaveBeenCalledWith(mockStockLevel);

      expect(mockMovRepo.create).toHaveBeenCalledWith({
        skuId: 'sku-uuid',
        warehouseId: 'wh-uuid',
        tenantId: TENANT_ID,
        reason: MovementReason.PURCHASE_ORDER_RECEIPT,
        quantityChange: 10,
        balanceAfter: 15,
        idempotencyKey: 'idem-key-123',
        performedByUserId: 'user-uuid',
        performedByAgent: null,
        referenceType: null,
        referenceId: null,
        note: 'PO received',
      });
      expect(mockMovRepo.save).toHaveBeenCalled();
      expect(result.balanceAfter).toBe(15);
      expect(result.skuId).toBe('sku-uuid');
      expect(result.warehouseId).toBe('wh-uuid');
    });
  });

  describe('transfer', () => {
    const transferParams = {
      skuId: 'sku-uuid',
      fromWarehouseId: 'wh-a',
      toWarehouseId: 'wh-b',
      quantity: 5,
      idempotencyKey: 'transfer-key-1',
      performedByUserId: 'user-uuid',
    };

    it('should reject transfer when destination warehouse is at capacity', async () => {
      mockMovRepo.findOne.mockResolvedValue(null);
      mockStockLevelRepo.findOne.mockResolvedValue({ id: 'sl-a', quantity: 20 });
      mockWarehouseRepo.findOne.mockResolvedValue({ id: 'wh-b', capacityUnits: 10 });
      mockStockLevelRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '10' }),
      });

      await expect(service.transfer(TENANT_ID, transferParams)).rejects.toMatchObject({
        response: { code: 'WAREHOUSE_CAPACITY_EXCEEDED' },
      });
    });
  });

  describe('getHistoryForSku', () => {
    it('should return paginated list of mapped movements filterable by query parameters', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'm1',
              skuId: 'sku-uuid',
              reason: MovementReason.SALE,
              quantityChange: -2,
              balanceAfter: 8,
              createdAt: new Date(),
            },
          ],
          1,
        ]),
      };
      mockMovRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getHistoryForSku(TENANT_ID, 'sku-uuid', {
        reason: MovementReason.SALE,
        page: 1,
        limit: 10,
      });

      expect(mockMovRepo.createQueryBuilder).toHaveBeenCalledWith('sm');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'sm.skuId = :skuId',
        { skuId: 'sku-uuid' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sm.reason = :reason',
        { reason: MovementReason.SALE },
      );
      expect(result.data.length).toBe(1);
      expect(result.data[0].id).toBe('m1');
      expect(result.total).toBe(1);
    });
  });

  describe('reconcileBalance', () => {
    it('should throw NotFoundException if StockLevel is not found', async () => {
      mockStockLevelRepo.findOne.mockResolvedValue(null);

      await expect(service.reconcileBalance(TENANT_ID, 'invalid-sku', 'wh-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return reconciliation result comparing cached and ledger sum', async () => {
      mockStockLevelRepo.findOne.mockResolvedValue({
        id: 'sl-uuid',
        skuId: 'sku-uuid',
        warehouseId: 'wh-uuid',
        quantity: 12,
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '12' }),
      };
      mockMovRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.reconcileBalance(TENANT_ID, 'sku-uuid', 'wh-uuid');

      expect(result.skuId).toBe('sku-uuid');
      expect(result.warehouseId).toBe('wh-uuid');
      expect(result.cached).toBe(12);
      expect(result.calculated).toBe(12);
      expect(result.matches).toBe(true);
    });
  });

  describe('getConsumptionSeries', () => {
    it('should return daily net quantity rows parsed as integers', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { day: '2026-07-14', netChange: '-3' },
          { day: '2026-07-15', netChange: '10' },
        ]),
      };
      mockMovRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getConsumptionSeries(TENANT_ID, 'sku-uuid', 'wh-uuid', 30);

      expect(mockMovRepo.createQueryBuilder).toHaveBeenCalledWith('sm');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'sm.skuId = :skuId',
        { skuId: 'sku-uuid' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sm.warehouseId = :warehouseId',
        { warehouseId: 'wh-uuid' },
      );
      expect(result).toEqual([
        { day: '2026-07-14', netChange: -3 },
        { day: '2026-07-15', netChange: 10 },
      ]);
    });
  });
});
