import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForecastService } from './forecast.service';
import { Forecast } from './entities/forecast.entity';

describe('ForecastService', () => {
  let service: ForecastService;
  let mockRepo: any;

  const TENANT_ID = 'tenant-uuid';
  const SKU_ID = 'sku-uuid';

  beforeEach(async () => {
    jest.clearAllMocks();
    const created: Partial<Forecast> = {};
    mockRepo = {
      create: jest.fn().mockImplementation((e: Partial<Forecast>) => Object.assign(created, e)),
      save: jest.fn().mockImplementation(async (e: Partial<Forecast>) => ({ ...e, id: 'fc-1', createdAt: new Date() })),
      createQueryBuilder: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForecastService,
        { provide: getRepositoryToken(Forecast), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<ForecastService>(ForecastService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record an LLM forecast with default 30-day window', async () => {
    const saved = await service.record(TENANT_ID, SKU_ID, {
      projectedDemand: 123,
      confidenceScore: 88,
      period: 'next-30-days',
      model: 'llm',
    });
    expect(saved.projectedDemand).toBe(123);
    expect(saved.confidenceScore).toBe(88);
    expect(saved.model).toBe('llm');
    const created = mockRepo.create.mock.calls[0][0];
    expect(created.tenantId).toBe(TENANT_ID);
    expect(created.skuId).toBe(SKU_ID);
  });

  it('should clamp projected demand and confidence', async () => {
    const saved = await service.record(TENANT_ID, SKU_ID, {
      projectedDemand: -5,
      confidenceScore: 150,
      model: 'llm',
    });
    expect(saved.projectedDemand).toBe(0);
    expect(saved.confidenceScore).toBe(100);
  });

  it('should compute a statistical fallback from the daily series', async () => {
    const saved = await service.recordStatisticalFallback(
      TENANT_ID,
      SKU_ID,
      [10, 10, 10, 10, 10, 10],
      'next-30-days',
    );
    expect(saved.model).toBe('moving_avg');
    expect(saved.projectedDemand).toBe(300); // avg 10 * 30 days
    expect(saved.confidenceScore).toBeGreaterThanOrEqual(20);
    expect(saved.confidenceScore).toBeLessThanOrEqual(95);
  });

  it('should scale projection to the period length', async () => {
    const saved = await service.recordStatisticalFallback(
      TENANT_ID,
      SKU_ID,
      [5, 5, 5, 5, 5],
      'next-7-days',
    );
    expect(saved.projectedDemand).toBe(35); // avg 5 * 7 days
  });
});