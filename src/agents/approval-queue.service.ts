import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { ApprovalQueryDto } from './dto/approval-query.dto';
import { paginate } from '../utils/pagination.util';
import { AgentRunService } from './agent-run.service';
import { ApprovalRequestResponseDto } from './dto/approval-request-response.dto';
import { ApproveApprovalRequestDto, RejectApprovalRequestDto } from './dto/approval-action.dto';

@Injectable()
export class ApprovalQueueService {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepo: Repository<ApprovalRequest>,
    private readonly mapper: ApprovalRequestMapper,
    private readonly agentRunService: AgentRunService,
  ) {}

  async create(tenantId: string, data: CreateApprovalRequestDto): Promise<ApprovalRequestResponseDto> {
    const approval = this.approvalRepo.create({
      tenantId,
      agentRunId: data.agentRunId,
      agentType: data.agentType,
      stepNumber: data.stepNumber,
      payload: data.payload,
      reasoning: data.reasoning,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
    });

    const saved = await this.approvalRepo.save(approval);
    return this.mapper.toResponse(saved);
  }

  async findPending(
    tenantId: string,
    query: ApprovalQueryDto,
  ): Promise<{ data: ApprovalRequestResponseDto[]; total: number }> {
    const qb = this.approvalRepo
      .createQueryBuilder('approval')
      .where('approval.status = :status', { status: 'pending' })
      .andWhere('approval.tenantId = :tenantId', { tenantId })
      .orderBy('approval.createdAt', 'DESC');

    if (query.agentType) {
      qb.andWhere('approval.agentType = :agentType', {
        agentType: query.agentType,
      });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return {
      data: this.mapper.toResponseList(result.data),
      total: result.total,
    };
  }

  async approve(
    tenantId: string,
    id: string,
    reviewedBy: string,
    editedPayload?: object,
  ): Promise<ApprovalRequestResponseDto> {
    const approval = await this.approvalRepo.findOne({ where: { id, tenantId } });
    if (!approval) {
      throw new NotFoundException({ message: 'This approval request could not be found or has expired.', code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }

    approval.status = 'approved';
    approval.reviewedBy = reviewedBy;
    approval.reviewedAt = new Date();
    if (editedPayload) {
      approval.payload = {
        ...(approval.payload as Record<string, unknown>),
        ...(editedPayload as Record<string, unknown>),
      };
    }

    const saved = await this.approvalRepo.save(approval);
    return this.mapper.toResponse(saved);
  }

  async reject(
    tenantId: string,
    id: string,
    reviewedBy: string,
  ): Promise<ApprovalRequestResponseDto> {
    const approval = await this.approvalRepo.findOne({ where: { id, tenantId } });
    if (!approval) {
      throw new NotFoundException({ message: 'This approval request could not be found or has expired.', code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }

    approval.status = 'rejected';
    approval.reviewedBy = reviewedBy;
    approval.reviewedAt = new Date();
    const saved = await this.approvalRepo.save(approval);
    await this.agentRunService.updateStatus(tenantId, approval.agentRunId, 'rejected');
    return this.mapper.toResponse(saved);
  }
}
