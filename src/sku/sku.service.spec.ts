import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { SkuService } from './sku.service';
import { Sku } from './entities/sku.entity';
import { SkuMapper } from './mappers/sku.mapper';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';

describe('SkuService', () => {
  let service: SkuService;
  let repository: Repository<Sku>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
    },
  };

  const mockRepository = {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softRemove: jest.fn(),
    manager: {
      transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockQueryRunner.manager);
      }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkuService,
        SkuMapper,
        {
          provide: getRepositoryToken(Sku),
          useValue: mockRepository,
        },
        {
          provide: StockLevelsService,
          useValue: { autoInitializeForSku: jest.fn(), autoInitializeForSkus: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation(async (cb) => {
              return cb(mockQueryRunner.manager);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SkuService>(SkuService);
    repository = module.get<Repository<Sku>>(getRepositoryToken(Sku));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('importCsv', () => {
    it('should throw BadRequestException if buffer is empty', async () => {
      await expect(service.importCsv(Buffer.from(''))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if CSV is malformed', async () => {
      const malformedCsv = 'skuCode,name\n"unclosed quote,value';
      await expect(
        service.importCsv(Buffer.from(malformedCsv)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if CSV contains no data rows', async () => {
      const emptyCsv =
        'skuCode,name,description,category,unit,costPrice,sellingPrice\n';
      await expect(service.importCsv(Buffer.from(emptyCsv))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully import a valid CSV file', async () => {
      const validCsv = `skuCode,name,description,category,unit,costPrice,sellingPrice
SKU001,Laptop,Dell Latitude,Electronics,PCS,1000,1300
SKU002,Mouse,Wireless Mouse,Accessories,PCS,20,35`;

      mockRepository.find.mockResolvedValue([]);
      mockQueryRunner.manager.save.mockResolvedValue([]);

      const result = await service.importCsv(Buffer.from(validCsv));

      expect(result.totalRows).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.find).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
    });

    it('should detect missing required fields in CSV rows', async () => {
      const csvData = `skuCode,name,costPrice,sellingPrice
SKU001,,1000,1300
,Mouse,20,35`;

      const result = await service.importCsv(Buffer.from(csvData));

      expect(result.totalRows).toBe(2);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].message).toContain('name');
      expect(result.errors[1].row).toBe(3);
      expect(result.errors[1].message).toContain('skuCode');
    });

    it('should detect invalid numeric values in cost or price', async () => {
      const csvData = `skuCode,name,costPrice,sellingPrice
SKU001,Laptop,invalid_cost,1300
SKU002,Mouse,20,-35`;

      const result = await service.importCsv(Buffer.from(csvData));

      expect(result.totalRows).toBe(2);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].skuCode).toBe('SKU001');
      expect(result.errors[1].row).toBe(3);
      expect(result.errors[1].skuCode).toBe('SKU002');
    });

    it('should detect duplicate SKU codes inside the CSV itself', async () => {
      const csvData = `skuCode,name,costPrice,sellingPrice
SKU001,Laptop,1000,1300
SKU001,Laptop Duplicate,1000,1300`;

      mockRepository.find.mockResolvedValue([]);
      mockQueryRunner.manager.save.mockResolvedValue([]);

      const result = await service.importCsv(Buffer.from(csvData));

      expect(result.totalRows).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].row).toBe(3);
      expect(result.errors[0].skuCode).toBe('SKU001');
      expect(result.errors[0].message).toContain('Duplicate SKU code "SKU001" found in CSV file');
    });

    it('should detect duplicate SKU codes that already exist in the database', async () => {
      const csvData = `skuCode,name,costPrice,sellingPrice
SKU001,Laptop,1000,1300
SKU002,Mouse,20,35`;

      mockRepository.find.mockResolvedValue([{ sku: 'SKU001' }]);
      mockQueryRunner.manager.save.mockResolvedValue([]);

      const result = await service.importCsv(Buffer.from(csvData));

      expect(result.totalRows).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].skuCode).toBe('SKU001');
      expect(result.errors[0].message).toBe('SKU code "SKU001" already exists');
    });

    it('should handle UTF-8 files with Byte Order Mark (BOM)', async () => {
      const bomBuffer = Buffer.from(
        '\uFEFFskuCode,name,costPrice,sellingPrice\nSKU001,Laptop,1000,1300',
        'utf8',
      );

      mockRepository.find.mockResolvedValue([]);
      mockQueryRunner.manager.save.mockResolvedValue([]);

      const result = await service.importCsv(bomBuffer);

      expect(result.totalRows).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
