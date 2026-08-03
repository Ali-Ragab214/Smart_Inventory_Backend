import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnomalyFlag } from './entities/anomaly-flag.entity';
import { AnomalyFlagMapper } from './mappers/anomaly-flag.mapper';
import { CreateAnomalyFlagDto } from './dto/create-anomaly-flag.dto';
import { AnomalyFlagResponseDto } from './dto/anomaly-flag-response.dto';
import { paginate } from '../utils/pagination.util';
import { NotificationEvents } from '../notifications/events/notification-events';
import { AnomalyFlaggedEvent } from '../notifications/events/anomaly-flagged.event';

@Injectable()
export class AnomalyFlagsService {
  constructor(
    @InjectRepository(AnomalyFlag)
    private readonly flagRepo: Repository<AnomalyFlag>,
    private readonly mapper: AnomalyFlagMapper,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, data: CreateAnomalyFlagDto): Promise<AnomalyFlagResponseDto> {
    const flag = this.flagRepo.create({
      tenantId,
      skuId: data.skuId,
      description: data.description,
      relatedMovementIds: data.relatedMovementIds,
      agentRunId: data.agentRunId ?? null,
      status: 'flagged',
      reviewedBy: null,
    });

    const saved = await this.flagRepo.save(flag);

    this.eventEmitter.emit(
      NotificationEvents.ANOMALY_FLAGGED,
      new AnomalyFlaggedEvent(tenantId, {
        anomalyId: saved.id,
        skuId: saved.skuId ?? null,
        description: saved.description,
        agentRunId: saved.agentRunId ?? null,
        flaggedAt: saved.createdAt.toISOString(),
      }),
    );

    return this.mapper.toResponse(saved);
  }

  async findAll(
    tenantId: string,
    status?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: AnomalyFlagResponseDto[]; total: number }> {
    const qb = this.flagRepo
      .createQueryBuilder('flag')
      .where('flag.tenantId = :tenantId', { tenantId })
      .orderBy('flag.createdAt', 'DESC');

    if (status) {
      qb.where('flag.status = :status', { status });
    }

    const result = await paginate(qb, page, limit);
    return {
      data: this.mapper.toResponseList(result.data),
      total: result.total,
    };
  }

  async markReviewed(tenantId: string, id: string, reviewedBy: string): Promise<AnomalyFlagResponseDto> {
    const flag = await this.flagRepo.findOne({ where: { id, tenantId } });
    if (!flag) {
      throw new NotFoundException({ message: 'The selected anomaly flag does not exist.', code: 'ANOMALY_FLAG_NOT_FOUND' });
    }

    flag.status = 'reviewed';
    flag.reviewedBy = reviewedBy;

    const saved = await this.flagRepo.save(flag);
    return this.mapper.toResponse(saved);
  }

  async escalate(tenantId: string, id: string): Promise<AnomalyFlagResponseDto> {
    const flag = await this.flagRepo.findOne({ where: { id, tenantId } });
    if (!flag) {
      throw new NotFoundException({ message: 'The selected anomaly flag does not exist.', code: 'ANOMALY_FLAG_NOT_FOUND' });
    }

    flag.status = 'escalated';

    const saved = await this.flagRepo.save(flag);
    return this.mapper.toResponse(saved);
  }
}
