
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { AgentRunMapper } from './mappers/agent-run.mapper';
import { successResponse } from '../utils/response.util';
import { AgentRunDetailsResponseDto } from './dto/agent-run-details-response.dto';
import { AgentRunResponseDto } from './dto/agent-run-response.dto';
import { AgentStepResponseDto } from './dto/agent-step-response.dto';

export type AgentType = 'forecasting' | 'reorder' | 'negotiation' | 'anomaly';
export type AgentRunStatus =
  | 'in_progress'
  | 'awaiting_approval'
  | 'sent'
  | 'awaiting_vendor_response'
  | 'evaluating_counteroffer'
  | 'finalizing'
  | 'completed'
  | 'rejected'
  | 'escalated';

export type AgentRunRelatedInput = {
  skuIds?: string[];
  vendorId?: string;
  poId?: string;
  contextRunId?: string;
  negotiationItems?: Array<Record<string, unknown>>;
};

const VALID_AGENT_TYPES: AgentType[] = [
  'forecasting',
  'reorder',
  'negotiation',
  'anomaly',
];

const VALID_STATUSES: AgentRunStatus[] = [
  'in_progress',
  'awaiting_approval',
  'sent',
  'awaiting_vendor_response',
  'evaluating_counteroffer',
  'finalizing',
  'completed',
  'rejected',
  'escalated',
];

@Injectable()
export class AgentRunService {
  constructor(
    @InjectRepository(AgentRun)
    private readonly runRepository: Repository<AgentRun>,
    @InjectRepository(AgentStep)
    private readonly stepRepository: Repository<AgentStep>,
    private readonly dataSource: DataSource,
    private readonly mapper: AgentRunMapper,
    @InjectQueue('agent-jobs')
    private readonly agentQueue: Queue,
  ) {}

  async start(tenantId: string, agentType: AgentType, related: AgentRunRelatedInput = {}) {
    if (!VALID_AGENT_TYPES.includes(agentType)) {
      throw new BadRequestException({ message: 'The provided agent type is not recognized.', code: 'INVALID_AGENT_TYPE' });
    }

    const run = this.runRepository.create({
      tenantId,
      agentType,
      status: 'in_progress',
      skus: related.skuIds?.map(id => ({ id } as any)) ?? [],
      relatedVendorId: related.vendorId ?? null,
      relatedPoId: related.poId ?? null,
      contextRunId: related.contextRunId ?? null,
      roundNumber: 1,
      maxRounds: 3,
      negotiationItems: related.negotiationItems ?? null,
    });

    const saved = await this.runRepository.save(run);
    return successResponse(this.mapper.toRunResponse(saved));
  }

  async enqueue(
    tenantId: string,
    runId: string,
    agentType: AgentType,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.agentQueue.add('run-agent-step', {
      tenantId,
      runId,
      agentType,
      ...extra,
    });
  }

  async advanceRound(tenantId: string, runId: string): Promise<number> {
    const run = await this.runRepository.findOne({ where: { id: runId, tenantId } });
    if (!run) {
      throw new NotFoundException({ message: 'The requested agent run could not be found.', code: 'AGENT_RUN_NOT_FOUND' });
    }
    run.roundNumber += 1;
    const saved = await this.runRepository.save(run);
    return saved.roundNumber;
  }

  async load(tenantId: string, runId: string) {
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
      relations: ['skus'],
    });
    if (!run) {
      throw new NotFoundException({ message: 'The requested agent run could not be found.', code: 'AGENT_RUN_NOT_FOUND' });
    }

    const steps = await this.stepRepository.find({
      where: { agentRunId: runId },
      order: { stepNumber: 'ASC' },
    });

    const data: AgentRunDetailsResponseDto =
      this.mapper.toRunDetailsResponse(run, steps);
    return successResponse(data);
  }

  async appendStep(
    tenantId: string,
    runId: string,
    input: object,
    output: object,
    reasoning: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(AgentRun);
      const stepRepo = manager.getRepository(AgentStep);

      const run = await runRepo.findOne({
        where: { id: runId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) {
        throw new NotFoundException({ message: 'The requested agent run could not be found.', code: 'AGENT_RUN_NOT_FOUND' });
      }

      const existingSteps = await stepRepo.count({
        where: { agentRunId: runId },
      });

      const step = stepRepo.create({
        agentRunId: runId,
        stepNumber: existingSteps + 1,
        input,
        output,
        reasoning,
      });

      const saved = await stepRepo.save(step);
      const data: AgentStepResponseDto = this.mapper.toStepResponse(saved);
      return successResponse(data);
    });
  }

  async updateStatus(tenantId: string, runId: string, status: AgentRunStatus) {
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException({ message: 'The provided status update is invalid.', code: 'INVALID_RUN_STATUS' });
    }

    const run = await this.runRepository.findOne({ where: { id: runId, tenantId } });
    if (!run) {
      throw new NotFoundException({ message: 'The requested agent run could not be found.', code: 'AGENT_RUN_NOT_FOUND' });
    }

    run.status = status;
    const saved = await this.runRepository.save(run);
    return successResponse(this.mapper.toRunResponse(saved));
  }

  async loadEntity(tenantId: string, runId: string): Promise<AgentRun | null> {
    return this.runRepository.findOne({ where: { id: runId, tenantId } });
  }

  async findRecent(tenantId: string, limit = 20) {
    const runs = await this.runRepository.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    const data: AgentRunResponseDto[] = this.mapper.toRunResponseList(runs);
    return successResponse(data);
  }
}
