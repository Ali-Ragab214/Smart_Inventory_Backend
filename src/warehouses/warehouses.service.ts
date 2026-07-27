import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';
import { WarehouseMapper } from './mappers/warehouse.mapper';
import { StockLevelsService } from '../inventory/stock-levels/stock-levels.service';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly warehouseMapper: WarehouseMapper,
    private readonly stockLevelsService: StockLevelsService,
  ) {}

  async create(dto: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    const warehouse = this.warehouseMapper.toEntity(dto);
    const saved = await this.warehouseRepository.save(warehouse);
    await this.stockLevelsService.autoInitializeForWarehouse(saved.id);
    return this.warehouseMapper.toResponse(saved);
  }

  async findAll(): Promise<WarehouseResponseDto[]> {
    const warehouses = await this.warehouseRepository.find();
    return this.warehouseMapper.toResponseList(warehouses);
  }

  async findOne(id: string): Promise<WarehouseResponseDto> {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID "${id}" not found`);
    }
    return this.warehouseMapper.toResponse(warehouse);
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<WarehouseResponseDto> {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID "${id}" not found`);
    }
    const updated = this.warehouseMapper.updateEntity(warehouse, dto);
    const saved = await this.warehouseRepository.save(updated);
    return this.warehouseMapper.toResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID "${id}" not found`);
    }
    await this.warehouseRepository.softRemove(warehouse);
  }
}
