import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { RagEvents } from '../rag/rag-events';
import { Warehouse } from './entities/warehouse.entity';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';
import { WarehouseSummaryDto } from './dto/warehouse-summary.dto';
import { WarehouseMapper } from './mappers/warehouse.mapper';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole, User } from '../users/entities/user.entity';
import { WarehouseStatus } from './entities/warehouse.entity';

import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly warehouseMapper: WarehouseMapper,
    private readonly stockLevelsService: StockLevelsService,
    private readonly tenantsService: TenantsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, dto: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    const limit = tenant.plan?.maxWarehouses ?? 3; // Free trial defaults to Pro
    const currentCount = await this.warehouseRepository.count({ where: { tenantId } });
    if (limit !== null && currentCount >= limit) {
      throw new ForbiddenException(`Warehouse limit reached for your plan (Max ${limit}). Please upgrade to add more locations.`);
    }

    const warehouse = this.warehouseMapper.toEntity(dto);
    warehouse.tenantId = tenantId;
    const saved = await this.warehouseRepository.save(warehouse);
    await this.stockLevelsService.autoInitializeForWarehouse(tenantId, saved.id);
    this.eventEmitter.emit(RagEvents.WAREHOUSE_SAVED, {
      tenantId,
      warehouseId: saved.id,
      warehouseName: saved.name,
      location: saved.location,
      status: saved.status,
      isMain: saved.isMain,
    });
    return this.warehouseMapper.toResponse(saved);
  }

  async findAll(user: UserResponseDto): Promise<WarehouseResponseDto[]> {
    const query: any = {};

    query.tenantId = user.tenantId!;

    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) {
      if (!user.warehouseId) return [];
      query.id = user.warehouseId;
    }

    const warehouses = await this.warehouseRepository.find({ where: query });
    return this.warehouseMapper.toResponseList(warehouses);
  }

  async findAllByTenant(tenantId: string): Promise<WarehouseResponseDto[]> {
    const warehouses = await this.warehouseRepository.find({ where: { tenantId } });
    return this.warehouseMapper.toResponseList(warehouses);
  }

  async findAllWithMetrics(user: UserResponseDto): Promise<WarehouseSummaryDto[]> {
    const warehouses = await this.findAll(user);
    const metrics = await this.stockLevelsService.getWarehouseMetrics(
      warehouses.map((w) => w.id),
      user.tenantId ?? undefined,
    );
    const metricsByWarehouse = new Map(metrics.map((m) => [m.warehouseId, m]));

    return warehouses.map((w) => {
      const m = metricsByWarehouse.get(w.id);
      return {
        ...w,
        units: m?.units ?? 0,
        stockValue: m?.stockValue ?? 0,
        targetValue: m?.targetValue ?? 0,
        coveragePct: m?.coveragePct ?? 0,
        capacityUsedPct:
          w.capacityUnits ? Math.min(100, Math.round(((m?.units ?? 0) / w.capacityUnits) * 100)) : 0,
        skuCount: m?.skuCount ?? 0,
        lowStockCount: m?.lowStockCount ?? 0,
        openOrderCount: m?.openOrderCount ?? 0,
        staffCount: m?.staffCount ?? 0,
      };
    });
  }

  async findOne(user: UserResponseDto, id: string): Promise<WarehouseResponseDto> {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) && user.warehouseId !== id) {
      throw new NotFoundException({ message: 'The specified warehouse could not be found.', code: 'WAREHOUSE_NOT_FOUND' });
    }

    const query: any = { id };
    query.tenantId = user.tenantId!;
    const warehouse = await this.warehouseRepository.findOne({ where: query });
    if (!warehouse) {
      throw new NotFoundException({ message: 'The specified warehouse could not be found.', code: 'WAREHOUSE_NOT_FOUND' });
    }
    return this.warehouseMapper.toResponse(warehouse);
  }

  async update(currentUser: UserResponseDto, id: string, dto: UpdateWarehouseDto): Promise<WarehouseResponseDto> {
    const tenantId = currentUser.tenantId!;
    const warehouse = await this.warehouseRepository.findOne({ where: { id, tenantId } });
    if (!warehouse) {
      throw new NotFoundException({ message: 'The specified warehouse could not be found.', code: 'WAREHOUSE_NOT_FOUND' });
    }
    
    if (dto.status !== undefined && dto.status !== warehouse.status) {
      if (currentUser.role !== UserRole.TENANT) {
        throw new ForbiddenException('Only tenant owners can activate or deactivate a warehouse.');
      }
    }

    const updated = this.warehouseMapper.updateEntity(warehouse, dto);
    const saved = await this.warehouseRepository.save(updated);
    this.eventEmitter.emit(RagEvents.WAREHOUSE_SAVED, {
      tenantId,
      warehouseId: saved.id,
      warehouseName: saved.name,
      location: saved.location,
      status: saved.status,
      isMain: saved.isMain,
    });
    return this.warehouseMapper.toResponse(saved);
  }

  async remove(currentUser: UserResponseDto, id: string): Promise<void> {
    const tenantId = currentUser.tenantId!;
    const warehouse = await this.warehouseRepository.findOne({ where: { id, tenantId } });
    if (!warehouse) {
      throw new NotFoundException({ message: 'The specified warehouse could not be found.', code: 'WAREHOUSE_NOT_FOUND' });
    }
    
    warehouse.status = WarehouseStatus.INACTIVE;
    await this.warehouseRepository.save(warehouse);
    this.eventEmitter.emit(RagEvents.WAREHOUSE_DELETED, {
      tenantId,
      warehouseId: id,
      warehouseName: warehouse.name,
    });

    await this.warehouseRepository.manager
      .createQueryBuilder()
      .update(User)
      .set({ isActive: false })
      .where('warehouse_id = :warehouseId', { warehouseId: id })
      .andWhere('role = :role', { role: UserRole.WAREHOUSE_MANAGER })
      .execute();
  }
}
