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
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
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
import { WarehouseSummaryDto } from './dto/warehouse-summary.dto';
import { successResponse } from '../utils/response.util';

@ApiTags('warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a warehouse' })
  @ApiCreatedResponse({ type: WarehouseResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async create(@Body() dto: CreateWarehouseDto, @CurrentUser() user: UserResponseDto) {
    const data = await this.warehousesService.create(user.tenantId!, dto);
    return successResponse(data);
  }

  @Get()
  @ApiOperation({ summary: 'List all warehouses' })
  @ApiOkResponse({ type: WarehouseResponseDto, isArray: true })
  async findAll(@CurrentUser() user: UserResponseDto) {
    const data = await this.warehousesService.findAll(user);
    return successResponse(data);
  }

  @Get('summary')
  @ApiOperation({ summary: 'List all warehouses with live metrics (units, stock value, coverage, staff, open orders)' })
  @ApiOkResponse({ type: WarehouseSummaryDto, isArray: true })
  async findAllSummary(@CurrentUser() user: UserResponseDto) {
    const data = await this.warehousesService.findAllWithMetrics(user);
    return successResponse(data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a warehouse by ID' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  @ApiNotFoundResponse({ description: 'Warehouse not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    const data = await this.warehousesService.findOne(user, id);
    return successResponse(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiNotFoundResponse({ description: 'Warehouse not found' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto, @CurrentUser() user: UserResponseDto) {
    const data = await this.warehousesService.update(user, id, dto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiOkResponse({ description: 'Warehouse deleted successfully' })
  @ApiNotFoundResponse({ description: 'Warehouse not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    await this.warehousesService.remove(user, id);
    return successResponse(null);
  }
}
