import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLineItem } from './entities/purchase-order-line-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderMapper } from './mappers/purchase-order.mapper';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { paginate } from '../utils/pagination.util';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['sent'],
  sent: ['received'],
  received: [],
  rejected: [],
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    private readonly mapper: PurchaseOrderMapper,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const po = this.mapper.toEntity(dto);
    const saved = await this.poRepository.save(po);
    const loaded = await this.poRepository.findOne({
      where: { id: saved.id },
      relations: { lineItems: true },
    });
    return this.mapper.toResponse(loaded!);
  }

  async findAll(query: PurchaseOrderQueryDto): Promise<{ data: PurchaseOrderResponseDto[]; total: number }> {
    const qb = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.lineItems', 'lineItems')
      .orderBy('po.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    if (query.warehouseId) {
      qb.andWhere('po.warehouseId = :warehouseId', { warehouseId: query.warehouseId });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: this.mapper.toResponseList(result.data), total: result.total };
  }

  async findOne(id: string): Promise<PurchaseOrderResponseDto> {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: { lineItems: true },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID "${id}" not found`);
    }
    return this.mapper.toResponse(po);
  }

  async transition(id: string, targetStatus: string): Promise<PurchaseOrderResponseDto> {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: { lineItems: true },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID "${id}" not found`);
    }

    const allowed = VALID_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${po.status}' to '${targetStatus}'. Allowed transitions: ${allowed.join(', ') || 'none (terminal status)'}`,
      );
    }

    po.status = targetStatus;
    const saved = await this.poRepository.save(po);
    const loaded = await this.poRepository.findOne({
      where: { id: saved.id },
      relations: { lineItems: true },
    });
    return this.mapper.toResponse(loaded!);
  }
}
