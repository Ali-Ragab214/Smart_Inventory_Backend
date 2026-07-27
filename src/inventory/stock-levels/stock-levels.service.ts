import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { paginate } from '../../utils/pagination.util';

@Injectable()
export class StockLevelsService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockLevelRepo: Repository<StockLevel>,
  ) {}


  async findAll(
    query: StockLevelQueryDto,
  ): Promise<{ data: StockLevelResponseDto[]; total: number }> {
    const qb = this.stockLevelRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .orderBy('sl.createdAt', 'DESC');

    if (query.skuId) {
      qb.andWhere('sl.skuId = :skuId', { skuId: query.skuId });
    }
    if (query.warehouseId) {
      qb.andWhere('sl.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    }

    const result = await paginate(qb, query.page!, query.limit!);
    return { data: result.data.map((sl) => this.toResponse(sl)), total: result.total };
  }

  
  async findOne(id: string): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException(`Stock level with ID "${id}" not found`);
    }

    return this.toResponse(stockLevel);
  }


  async update(
    id: string,
    dto: UpdateStockLevelDto,
  ): Promise<StockLevelResponseDto> {
    const stockLevel = await this.stockLevelRepo.findOne({
      where: { id },
      relations: ['sku', 'warehouse'],
    });

    if (!stockLevel) {
      throw new NotFoundException(`Stock level with ID "${id}" not found`);
    }

    if (dto.reorderThreshold !== undefined) {
      stockLevel.reorderThreshold = dto.reorderThreshold;
    }
    if (dto.safetyStock !== undefined) {
      stockLevel.safetyStock = dto.safetyStock;
    }

  
    await this.stockLevelRepo.save(stockLevel);
    return this.toResponse(stockLevel);
  }

 
  async findLowStock(): Promise<StockLevelResponseDto[]> {
    const levels = await this.stockLevelRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.sku', 'sku')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.quantity <= sl.reorderThreshold')
      .orderBy('sl.quantity', 'ASC')
      .getMany();

    return levels.map((sl) => this.toResponse(sl));
  }

  private toResponse(stockLevel: StockLevel): StockLevelResponseDto {
    const dto = new StockLevelResponseDto();
    dto.id = stockLevel.id;
    dto.skuId = stockLevel.skuId;
    dto.skuName = stockLevel.sku?.name ?? '';
    dto.warehouseId = stockLevel.warehouseId;
    dto.warehouseName = stockLevel.warehouse?.name ?? '';
    dto.quantity = stockLevel.quantity;
    dto.reorderThreshold = stockLevel.reorderThreshold;
    dto.safetyStock = stockLevel.safetyStock;
    dto.createdAt = stockLevel.createdAt;
    dto.updatedAt = stockLevel.updatedAt;
    return dto;
  }
}
