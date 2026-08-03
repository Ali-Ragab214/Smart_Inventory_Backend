import { Test, TestingModule } from '@nestjs/testing';
import { StockMovementController } from './stock-movement.controller';
import { StockMovementService } from './stock-movement.service';
import { MovementReason } from './enums/movement-reason.enum';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';

describe('StockMovementController', () => {
  let controller: StockMovementController;
  let service: StockMovementService;

  const mockStockMovementService = {
    getHistoryForSku: jest.fn(),
    reconcileBalance: jest.fn(),
    getConsumptionSeries: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockMovementController],
      providers: [
        {
          provide: StockMovementService,
          useValue: mockStockMovementService,
        },
      ],
    }).compile();

    controller = module.get<StockMovementController>(StockMovementController);
    service = module.get<StockMovementService>(StockMovementService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  const mockUser = { id: 'u1', tenantId: 'tenant-1', warehouseId: 'wh-1' } as any;

  describe('getHistoryForSku', () => {
    it('should return paginated response wrapped from service', async () => {
      const mockData = [
        {
          id: 'mov-1',
          skuId: 'sku-1',
          warehouseId: 'wh-1',
          reason: MovementReason.MANUAL_ADJUSTMENT,
          quantityChange: 5,
          balanceAfter: 15,
          createdAt: new Date(),
        },
      ];

      mockStockMovementService.getHistoryForSku.mockResolvedValue({
        data: mockData,
        total: 10,
      });

      const queryDto: StockMovementQueryDto = { reason: MovementReason.MANUAL_ADJUSTMENT, page: 1, limit: 10 };
      const result = await controller.getHistoryForSku('sku-uuid', queryDto, mockUser);

      expect(mockStockMovementService.getHistoryForSku).toHaveBeenCalledWith(
        'tenant-1',
        'sku-uuid',
        queryDto,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(10);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('reconcileBalance', () => {
    it('should return success response wrapped from service', async () => {
      const mockResult = {
        skuId: 'sku-uuid',
        warehouseId: 'wh-uuid',
        cached: 10,
        calculated: 10,
        matches: true,
      };

      mockStockMovementService.reconcileBalance.mockResolvedValue(mockResult);

      const result = await controller.reconcileBalance('sku-uuid', 'wh-uuid' as any, mockUser);

      expect(mockStockMovementService.reconcileBalance).toHaveBeenCalledWith('tenant-1', 'sku-uuid', 'wh-uuid');
      expect(result).toEqual({ success: true, data: mockResult, meta: null });
    });
  });

  describe('getConsumptionSeries', () => {
    it('should return success response wrapped from service with default sinceDays', async () => {
      const mockResult = [
        { day: '2026-07-15', netChange: -5 },
        { day: '2026-07-16', netChange: 10 },
      ];

      mockStockMovementService.getConsumptionSeries.mockResolvedValue(mockResult);

      const result = await controller.getConsumptionSeries('sku-uuid', 'wh-uuid' as any, 30 as any, mockUser);

      expect(mockStockMovementService.getConsumptionSeries).toHaveBeenCalledWith('tenant-1', 'sku-uuid', 'wh-uuid', 30);
      expect(result).toEqual({ success: true, data: mockResult, meta: null });
    });
  });
});
