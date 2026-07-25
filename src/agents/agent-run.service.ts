
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
  | 'completed'
  | 'rejected'
  | 'escalated';

export type AgentRunRelatedInput = {
  skuId?: string;
  vendorId?: string;
  poId?: string;
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

  async start(agentType: AgentType, related: AgentRunRelatedInput = {}) {
    if (!VALID_AGENT_TYPES.includes(agentType)) {
      throw new BadRequestException(`Invalid agent type: ${agentType}`);
    }

    const run = this.runRepository.create({
      agentType,
      status: 'in_progress',
      relatedSkuId: related.skuId ?? null,
      relatedVendorId: related.vendorId ?? null,
      relatedPoId: related.poId ?? null,
    });

    const saved = await this.runRepository.save(run);
    return successResponse(this.mapper.toRunResponse(saved));
  }

  async enqueue(runId: string, agentType: AgentType): Promise<void> {
    await this.agentQueue.add('run-agent-step', { runId, agentType });
  }

  async load(runId: string) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`Agent run with ID "${runId}" not found`);
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
    runId: string,
    input: object,
    output: object,
    reasoning: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(AgentRun);
      const stepRepo = manager.getRepository(AgentStep);

      const run = await runRepo.findOne({
        where: { id: runId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) {
        throw new NotFoundException(`Agent run with ID "${runId}" not found`);
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

  async updateStatus(runId: string, status: AgentRunStatus) {
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException(`Invalid run status: ${status}`);
    }

    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`Agent run with ID "${runId}" not found`);
    }

    run.status = status;
    const saved = await this.runRepository.save(run);
    return successResponse(this.mapper.toRunResponse(saved));
  }

  async findRecent(limit = 20) {
    const runs = await this.runRepository.find({
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    const data: AgentRunResponseDto[] = this.mapper.toRunResponseList(runs);
    return successResponse(data);
  }
}
