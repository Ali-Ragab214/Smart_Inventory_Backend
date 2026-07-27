import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StockLevelsService } from './stock-levels.service';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { successResponse, paginatedResponse } from '../../utils/response.util';

@ApiTags('Warehouse Stock Levels')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/stock-levels')
export class WarehouseStockLevelsController {
  constructor(private readonly stockLevelsService: StockLevelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all stock levels for a warehouse (filterable by skuId)' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findAll(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query() query: StockLevelQueryDto,
  ) {
    const { data, total } = await this.stockLevelsService.findByWarehouse(warehouseId, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'List low-stock items for a warehouse' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findLowStock(@Param('warehouseId', ParseUUIDPipe) warehouseId: string) {
    const data = await this.stockLevelsService.findLowStockByWarehouse(warehouseId);
    return successResponse(data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a stock level by ID within a warehouse' })
  @ApiParam({ name: 'id', description: 'StockLevel UUID' })
  @ApiOkResponse({ type: StockLevelResponseDto })
  @ApiNotFoundResponse({ description: 'Stock level not found' })
  async findOne(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.stockLevelsService.findOneByWarehouse(warehouseId, id);
    return successResponse(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update reorderThreshold / safetyStock on a stock level' })
  @ApiParam({ name: 'id', description: 'StockLevel UUID' })
  @ApiOkResponse({ type: StockLevelResponseDto })
  @ApiNotFoundResponse({ description: 'Stock level not found' })
  async update(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockLevelDto,
  ) {
    const data = await this.stockLevelsService.update(id, dto);
    return successResponse(data);
  }

  @Post('initialize')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize stock levels for all SKUs missing in this warehouse' })
  @ApiCreatedResponse({ description: 'Stock levels initialized' })
  async initialize(@Param('warehouseId', ParseUUIDPipe) warehouseId: string) {
    const count = await this.stockLevelsService.initializeForWarehouse(warehouseId);
    return successResponse({ initialized: count });
  }
}