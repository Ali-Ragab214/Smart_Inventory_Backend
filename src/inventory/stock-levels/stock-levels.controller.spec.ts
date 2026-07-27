import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StockLevelsController } from './stock-levels.controller';
import { StockLevelsService } from './stock-levels.service';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeResponseDto(overrides: Partial<StockLevelResponseDto> = {}): StockLevelResponseDto {
  const dto = new StockLevelResponseDto();
  dto.id = 'sl-uuid';
  dto.skuId = 'sku-uuid';
  dto.skuName = 'Widget A';
  dto.warehouseId = 'wh-uuid';
  dto.warehouseName = 'Main Warehouse';
  dto.quantity = 100;
  dto.reorderThreshold = 20;
  dto.safetyStock = 10;
  dto.createdAt = new Date('2026-01-01');
  dto.updatedAt = new Date('2026-01-02');
  return Object.assign(dto, overrides);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('StockLevelsController', () => {
  let controller: StockLevelsController;
  let mockService: jest.Mocked<StockLevelsService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      findLowStock: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockLevelsController],
      providers: [{ provide: StockLevelsService, useValue: mockService }],
    }).compile();

    controller = module.get<StockLevelsController>(StockLevelsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return a paginated response', async () => {
      mockService.findAll.mockResolvedValue({
        data: [makeResponseDto()],
        total: 1,
      });

      const result = await controller.findAll({ page: 1, limit: 20 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(mockService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });
  });

  // ── findLowStock ─────────────────────────────────────────────────────────

  describe('findLowStock', () => {
    it('should return success response with low-stock records', async () => {
      const lowDto = makeResponseDto({ quantity: 5 });
      mockService.findLowStock.mockResolvedValue([lowDto]);

      const result = await controller.findLowStock();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect((result.data as StockLevelResponseDto[])[0].quantity).toBe(5);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return success response for existing stock level', async () => {
      mockService.findOne.mockResolvedValue(makeResponseDto());

      const result = await controller.findOne('sl-uuid');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('sl-uuid');
      expect(result.data.skuName).toBe('Widget A');
      expect(mockService.findOne).toHaveBeenCalledWith('sl-uuid');
    });

    it('should propagate NotFoundException from service', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException('Not found'));

      await expect(controller.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should return updated stock level', async () => {
      const updated = makeResponseDto({ reorderThreshold: 30, safetyStock: 15 });
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update('sl-uuid', {
        reorderThreshold: 30,
        safetyStock: 15,
      });

      expect(result.success).toBe(true);
      expect(result.data.reorderThreshold).toBe(30);
      expect(result.data.safetyStock).toBe(15);
      expect(mockService.update).toHaveBeenCalledWith('sl-uuid', {
        reorderThreshold: 30,
        safetyStock: 15,
      });
    });

    it('should propagate NotFoundException from service', async () => {
      mockService.update.mockRejectedValue(new NotFoundException('Not found'));

      await expect(
        controller.update('nonexistent', { reorderThreshold: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
