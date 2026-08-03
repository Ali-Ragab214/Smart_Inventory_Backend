import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';
import { WarehouseMapper } from './mappers/warehouse.mapper';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole, User } from '../users/entities/user.entity';
import { WarehouseStatus } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly warehouseMapper: WarehouseMapper,
    private readonly stockLevelsService: StockLevelsService,
  ) {}

  async create(tenantId: string, dto: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    const warehouse = this.warehouseMapper.toEntity(dto);
    warehouse.tenantId = tenantId;
    const saved = await this.warehouseRepository.save(warehouse);
    await this.stockLevelsService.autoInitializeForWarehouse(tenantId, saved.id);
    return this.warehouseMapper.toResponse(saved);
  }

  async findAll(user: UserResponseDto): Promise<WarehouseResponseDto[]> {
    const query: any = {};

    if (user.role !== UserRole.SUPER_ADMIN) {
      query.tenantId = user.tenantId!;
    }

    if (user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.INVENTORY_CLERK) {
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

  async findOne(user: UserResponseDto, id: string): Promise<WarehouseResponseDto> {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.INVENTORY_CLERK) && user.warehouseId !== id) {
      throw new NotFoundException({ message: 'The specified warehouse could not be found.', code: 'WAREHOUSE_NOT_FOUND' });
    }

    const query: any = { id };
    if (user.role !== UserRole.SUPER_ADMIN) {
      query.tenantId = user.tenantId!;
    }
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
      if (currentUser.role !== UserRole.TENANT_OWNER && currentUser.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Only tenant owners can activate or deactivate a warehouse.');
      }
    }

    const updated = this.warehouseMapper.updateEntity(warehouse, dto);
    const saved = await this.warehouseRepository.save(updated);
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

    await this.warehouseRepository.manager
      .createQueryBuilder()
      .update(User)
      .set({ isActive: false })
      .where('warehouse_id = :warehouseId', { warehouseId: id })
      .andWhere('role = :role', { role: UserRole.WAREHOUSE_MANAGER })
      .execute();
  }
}
