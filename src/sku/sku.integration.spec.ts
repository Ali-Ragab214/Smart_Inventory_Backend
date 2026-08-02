import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import 'multer';
import { SkuController } from './sku.controller';
import { SkuService } from './sku.service';
import { Sku } from './entities/sku.entity';
import { SkuMapper } from './mappers/sku.mapper';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';

describe('Sku CSV Import Integration Flow', () => {
  let controller: SkuController;
  let service: SkuService;
  let repository: any;

  const savedEntitiesInDb: any[] = [];

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn().mockImplementation(async (entityClass, entities) => {
        if (!entities) {
          entities = entityClass;
          entityClass = Sku;
        }
        const arr = Array.isArray(entities) ? entities : [entities];
        arr.forEach((e: any, idx: number) => {
          e.id = `uuid-${savedEntitiesInDb.length + idx + 1}`;
          savedEntitiesInDb.push(e);
        });
        return arr;
      }),
    },
  };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb) => {
      return cb(mockQueryRunner.manager);
    }),
  };

  const mockRepository = {
    find: jest.fn().mockImplementation(async (options) => {
      if (options?.where) {
        const conditions = Array.isArray(options.where) ? options.where : [options.where];
        return savedEntitiesInDb.filter((item: any) =>
          conditions.some((cond: any) => item.sku === cond.sku),
        );
      }
      return [];
    }),
    findOne: jest.fn().mockImplementation(async (options) => {
      if (options?.where?.sku) {
        return savedEntitiesInDb.find(
          (item: any) => item.sku === options.where.sku,
        ) || null;
      }
      return null;
    }),
    save: jest.fn().mockImplementation(async (entity) => {
      entity.id = `uuid-${savedEntitiesInDb.length + 1}`;
      savedEntitiesInDb.push(entity);
      return entity;
    }),
  };

  beforeEach(async () => {
    savedEntitiesInDb.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkuController],
      providers: [
        SkuService,
        SkuMapper,
        {
          provide: getRepositoryToken(Sku),
          useValue: mockRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: StockLevelsService,
          useValue: { autoInitializeForSku: jest.fn(), autoInitializeForSkus: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<SkuController>(SkuController);
    service = module.get<SkuService>(SkuService);
    repository = module.get(getRepositoryToken(Sku));
  });

  it('should process full CSV import lifecycle with persistence, validation and error reporting', async () => {
    // Seed DB with existing SKU
    savedEntitiesInDb.push({
      id: 'existing-uuid-1',
      sku: 'SKU001',
      name: 'Existing Laptop',
      cost: 500,
      price: 800,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const csvContent = `skuCode,name,description,category,unit,costPrice,sellingPrice
SKU001,Laptop,Dell Latitude,Electronics,PCS,1000,1300
SKU002,Mouse,Wireless Mouse,Accessories,PCS,20,35
SKU002,Mouse Duplicate,Wireless Mouse,Accessories,PCS,20,35
SKU003,Keyboard,,Peripherals,PCS,bad_cost,50
SKU004,Monitor,27-inch 4K,Displays,PCS,300,450`;

    const mockFile = {
      originalname: 'inventory.csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    } as Express.Multer.File;

    const mockUser = { id: 'user-1', tenantId: 'tenant-1' } as any;

    const response = await controller.importCsv(mockFile, mockUser);

    expect(response.success).toBe(true);
    expect(response.data.totalRows).toBe(5);
    expect(response.data.successful).toBe(2);
    expect(response.data.failed).toBe(3);

    const errors = response.data.errors;
    expect(errors).toHaveLength(3);

    expect(errors[0].row).toBe(2);
    expect(errors[0].skuCode).toBe('SKU001');
    expect(errors[0].message).toBe('SKU code "SKU001" already exists');

    expect(errors[1].row).toBe(4);
    expect(errors[1].skuCode).toBe('SKU002');
    expect(errors[1].message).toContain('Duplicate SKU code "SKU002" found in CSV file');

    expect(errors[2].row).toBe(5);
    expect(errors[2].skuCode).toBe('SKU003');

    expect(savedEntitiesInDb).toHaveLength(3);
    const sku002InDb = savedEntitiesInDb.find((s: any) => s.sku === 'SKU002');
    const sku004InDb = savedEntitiesInDb.find((s: any) => s.sku === 'SKU004');

    expect(sku002InDb).toBeDefined();
    expect(sku002InDb.name).toBe('Mouse');
    expect(sku002InDb.cost).toBe(20);
    expect(sku002InDb.price).toBe(35);

    expect(sku004InDb).toBeDefined();
    expect(sku004InDb.name).toBe('Monitor');
    expect(sku004InDb.cost).toBe(300);
    expect(sku004InDb.price).toBe(450);
  });
});
