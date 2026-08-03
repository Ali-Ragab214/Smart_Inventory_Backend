import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import 'multer';
import { SkuController } from './sku.controller';
import { SkuService } from './sku.service';

describe('SkuController', () => {
  let controller: SkuController;
  let service: SkuService;

  const mockSkuService = {
    create: jest.fn(),
    importCsv: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkuController],
      providers: [
        {
          provide: SkuService,
          useValue: mockSkuService,
        },
      ],
    }).compile();

    controller = module.get<SkuController>(SkuController);
    service = module.get<SkuService>(SkuService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('importCsv', () => {
    const mockUser = { id: 'u1', tenantId: 'tenant-1' } as any;

    it('should throw BadRequestException if file is missing', async () => {
      await expect(controller.importCsv(undefined, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if file extension is not .csv', async () => {
      const mockFile = {
        originalname: 'test.png',
        buffer: Buffer.from('data'),
      } as Express.Multer.File;

      await expect(controller.importCsv(mockFile, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should call skuService.importCsv and wrap response on valid file upload', async () => {
      const mockFile = {
        originalname: 'skus.csv',
        buffer: Buffer.from('skuCode,name,costPrice,sellingPrice\nSKU001,Laptop,1000,1300'),
      } as Express.Multer.File;

      const mockResponse = {
        totalRows: 1,
        successful: 1,
        failed: 0,
        errors: [],
      };

      mockSkuService.importCsv.mockResolvedValue(mockResponse);

      const mockUser = { id: 'u1', tenantId: 'tenant-1' } as any;
      const result = await controller.importCsv(mockFile, mockUser);

      expect(mockSkuService.importCsv).toHaveBeenCalledWith('tenant-1', mockFile.buffer);
      expect(result).toEqual({
        success: true,
        data: mockResponse,
        meta: null,
      });
    });
  });
});
