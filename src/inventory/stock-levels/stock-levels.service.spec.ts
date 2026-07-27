import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { StockLevelsService } from './stock-levels.service';
import { StockLevel } from './entities/stock-level.entity';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStockLevel(overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    id: 'sl-uuid',
    skuId: 'sku-uuid',
    sku: { id: 'sku-uuid', name: 'Widget A' } as any,
    warehouseId: 'wh-uuid',
    warehouse: { id: 'wh-uuid', name: 'Main Warehouse' } as any,
    quantity: 100,
    reorderThreshold: 20,
    safetyStock: 10,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  } as StockLevel;
}


function makeQueryBuilder(rows: StockLevel[], total: number) {
  const qb: any = {
    createQueryBuilder: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

// ─── Suite 

describe('StockLevelsService', () => {
  let service: StockLevelsService;
  let mockRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockLevelsService,
        { provide: getRepositoryToken(StockLevel), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<StockLevelsService>(StockLevelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated list mapped to response DTOs', async () => {
      const level = makeStockLevel();
      const qb = makeQueryBuilder([level], 1);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('sl-uuid');
      expect(result.data[0].skuName).toBe('Widget A');
      expect(result.data[0].warehouseName).toBe('Main Warehouse');
    });

    it('should apply skuId filter when provided', async () => {
      const qb = makeQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, limit: 20, skuId: 'sku-uuid' });

      expect(qb.andWhere).toHaveBeenCalledWith('sl.skuId = :skuId', {
        skuId: 'sku-uuid',
      });
    });

    it('should apply warehouseId filter when provided', async () => {
      const qb = makeQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, limit: 20, warehouseId: 'wh-uuid' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'sl.warehouseId = :warehouseId',
        { warehouseId: 'wh-uuid' },
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a single mapped response DTO', async () => {
      mockRepo.findOne.mockResolvedValue(makeStockLevel());

      const result = await service.findOne('sl-uuid');

      expect(result.id).toBe('sl-uuid');
      expect(result.skuName).toBe('Widget A');
      expect(result.warehouseName).toBe('Main Warehouse');
      expect(result.quantity).toBe(100);
    });

    it('should throw NotFoundException when record does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update reorderThreshold and safetyStock and return updated DTO', async () => {
      const level = makeStockLevel();
      mockRepo.findOne.mockResolvedValue(level);
      mockRepo.save.mockImplementation((entity: StockLevel) =>
        Promise.resolve({ ...entity }),
      );

      const result = await service.update('sl-uuid', {
        reorderThreshold: 30,
        safetyStock: 15,
      });

      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.reorderThreshold).toBe(30);
      expect(result.safetyStock).toBe(15);
      // quantity must remain untouched
      expect(result.quantity).toBe(100);
    });

    it('should update only reorderThreshold when safetyStock is omitted', async () => {
      const level = makeStockLevel();
      mockRepo.findOne.mockResolvedValue(level);
      mockRepo.save.mockResolvedValue({ ...level, reorderThreshold: 40 });

      const result = await service.update('sl-uuid', { reorderThreshold: 40 });

      expect(result.reorderThreshold).toBe(40);
    });

    it('should throw NotFoundException when record does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { reorderThreshold: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── findLowStock ─────────────────────────────────────────────────────────

  describe('findLowStock', () => {
    it('should return stock levels where quantity is at or below reorderThreshold', async () => {
      const lowLevel = makeStockLevel({ quantity: 5, reorderThreshold: 20 });
      const qb = makeQueryBuilder([lowLevel], 1);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findLowStock();

      expect(qb.where).toHaveBeenCalledWith(
        'sl.quantity <= sl.reorderThreshold',
      );
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(5);
    });

    it('should return empty array when all stock is above threshold', async () => {
      const qb = makeQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findLowStock();

      expect(result).toHaveLength(0);
    });
  });
});
