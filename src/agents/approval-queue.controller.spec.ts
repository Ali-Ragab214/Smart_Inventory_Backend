import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalQueueController } from './approval-queue.controller';
import { ApprovalQueueService } from './approval-queue.service';
import { ApprovalQueryDto } from './dto/approval-query.dto';

describe('ApprovalQueueController', () => {
  let controller: ApprovalQueueController;
  let service: ApprovalQueueService;

  const mockService = {
    findPending: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalQueueController],
      providers: [
        { provide: ApprovalQueueService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<ApprovalQueueController>(ApprovalQueueController);
    service = module.get<ApprovalQueueService>(ApprovalQueueService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return success response with combined pending items', async () => {
      const mockData = [
        { id: 'ar-1', type: 'agent_request', status: 'pending', description: 'reorder agent step 2', createdAt: new Date() },
        { id: 'po-1', type: 'purchase_order', status: 'pending_approval', description: 'Purchase Order', createdAt: new Date() },
      ];
      mockService.findPending.mockResolvedValue({ data: mockData, total: 2 });

      const query: ApprovalQueryDto = { page: 1, limit: 10 };
      const mockUser = { id: 'u1', tenantId: 'tenant-1' } as any;
      const result = await controller.findAll(query, mockUser);

      expect(mockService.findPending).toHaveBeenCalledWith('tenant-1', query);
      expect(result).toEqual({
        success: true,
        data: mockData,
        meta: { total: 2, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });
    });
  });
});
