import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnomalyFlag } from './entities/anomaly-flag.entity';
import { AnomalyFlagMapper } from './mappers/anomaly-flag.mapper';
import { CreateAnomalyFlagDto } from './dto/create-anomaly-flag.dto';
import { AnomalyFlagResponseDto } from './dto/anomaly-flag-response.dto';
import { paginate } from '../utils/pagination.util';

@Injectable()
export class AnomalyFlagsService {
  constructor(
    @InjectRepository(AnomalyFlag)
    private readonly flagRepo: Repository<AnomalyFlag>,
    private readonly mapper: AnomalyFlagMapper,
  ) {}

  async create(data: CreateAnomalyFlagDto): Promise<AnomalyFlagResponseDto> {
    const flag = this.flagRepo.create({
      skuId: data.skuId,
      description: data.description,
      relatedMovementIds: data.relatedMovementIds,
      agentRunId: data.agentRunId ?? null,
      status: 'flagged',
      reviewedBy: null,
    });

    const saved = await this.flagRepo.save(flag);
    return this.mapper.toResponse(saved);
  }

  async findAll(
    status?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: AnomalyFlagResponseDto[]; total: number }> {
    const qb = this.flagRepo
      .createQueryBuilder('flag')
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

  async markReviewed(id: string, reviewedBy: string): Promise<AnomalyFlagResponseDto> {
    const flag = await this.flagRepo.findOne({ where: { id } });
    if (!flag) {
      throw new NotFoundException(`Anomaly flag with ID "${id}" not found`);
    }

    flag.status = 'reviewed';
    flag.reviewedBy = reviewedBy;

    const saved = await this.flagRepo.save(flag);
    return this.mapper.toResponse(saved);
  }

  async escalate(id: string): Promise<AnomalyFlagResponseDto> {
    const flag = await this.flagRepo.findOne({ where: { id } });
    if (!flag) {
      throw new NotFoundException(`Anomaly flag with ID "${id}" not found`);
    }

    flag.status = 'escalated';

    const saved = await this.flagRepo.save(flag);
    return this.mapper.toResponse(saved);
  }
}
