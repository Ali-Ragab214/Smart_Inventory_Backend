import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';
import { successResponse } from '../utils/response.util';

@ApiTags('warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a warehouse' })
  @ApiCreatedResponse({ type: WarehouseResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async create(@Body() dto: CreateWarehouseDto, @Req() req: any) {
    const data = await this.warehousesService.create({ ...dto, tenantId: req.user.id });
    return successResponse(data);
  }

  @Get()
  @ApiOperation({ summary: 'List all warehouses' })
  @ApiOkResponse({ type: WarehouseResponseDto, isArray: true })
  async findAll(@Req() req: any) {
    if (req.user.role === 'super_admin') {
      const data = await this.warehousesService.findAll();
      return successResponse(data);
    }
    const data = await this.warehousesService.findAllByTenant(req.user.id);
    return successResponse(data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a warehouse by ID' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  @ApiNotFoundResponse({ description: 'Warehouse not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.warehousesService.findOne(id);
    return successResponse(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiNotFoundResponse({ description: 'Warehouse not found' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto) {
    const data = await this.warehousesService.update(id, dto);
    return successResponse(data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiOkResponse({ description: 'Warehouse deleted successfully' })
  @ApiNotFoundResponse({ description: 'Warehouse not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.warehousesService.remove(id);
    return successResponse(null);
  }
}
