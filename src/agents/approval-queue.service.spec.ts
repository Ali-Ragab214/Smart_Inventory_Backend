import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalQueueService } from './approval-queue.service';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';
import { AgentRunService } from './agent-run.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { ApprovalQueryDto } from './dto/approval-query.dto';

describe('ApprovalQueueService', () => {
  let service: ApprovalQueueService;
  let mockApprovalRepo: any;

  const TENANT_ID = 'tenant-uuid';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockApprovalRepo = {
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockAgentRunService = {
      updateStatus: jest.fn(),
    };

    const mockPurchaseOrdersService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalQueueService,
        ApprovalRequestMapper,
        { provide: getRepositoryToken(ApprovalRequest), useValue: mockApprovalRepo },
        { provide: AgentRunService, useValue: mockAgentRunService },
        { provide: PurchaseOrdersService, useValue: mockPurchaseOrdersService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<ApprovalQueueService>(ApprovalQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated approvals honoring status filter', async () => {
      const now = new Date();
      const mockData = [
        { id: 'ar-1', status: 'pending', agentType: 'reorder', stepNumber: 2, createdAt: now, payload: {}, reasoning: null, reviewedBy: null, reviewedAt: null, agentRunId: 'run-1' },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockData, 1]),
      };
      mockApprovalRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const query: ApprovalQueryDto = { page: 1, limit: 10, status: 'approved' };
      const result = await service.findAll(TENANT_ID, query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'approval.status = :status',
        { status: 'approved' },
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty array when nothing matches', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockApprovalRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const query: ApprovalQueryDto = { page: 1, limit: 10 };
      const result = await service.findAll(TENANT_ID, query);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
