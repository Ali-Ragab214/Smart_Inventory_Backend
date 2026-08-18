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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { TenantGuard } from '../../auth/tenant.guard';
import { WarehouseGuard } from '../../auth/warehouse.guard';
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
@UseGuards(TenantGuard, WarehouseGuard)
export class WarehouseStockLevelsController {
  constructor(private readonly stockLevelsService: StockLevelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all stock levels for a warehouse (filterable by skuId)' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findAll(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query() query: StockLevelQueryDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const { data, total } = await this.stockLevelsService.findByWarehouse(user.tenantId!, warehouseId, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }


  @Get(':id')
  @ApiOperation({ summary: 'Get a stock level by ID within a warehouse' })
  @ApiParam({ name: 'id', description: 'StockLevel UUID' })
  @ApiOkResponse({ type: StockLevelResponseDto })
  @ApiNotFoundResponse({ description: 'Stock level not found' })
  async findOne(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.stockLevelsService.findOneByWarehouse(user.tenantId!, warehouseId, id);
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
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.stockLevelsService.update(user.tenantId!, id, dto);
    return successResponse(data);
  }

  @Post('initialize')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize stock levels for all SKUs missing in this warehouse' })
  @ApiCreatedResponse({ description: 'Stock levels initialized' })
  async initialize(@Param('warehouseId', ParseUUIDPipe) warehouseId: string, @CurrentUser() user: UserResponseDto) {
    const count = await this.stockLevelsService.initializeForWarehouse(user.tenantId!, warehouseId);
    return successResponse({ initialized: count });
  }
}