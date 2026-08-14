import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StockLevelsService } from './stock-levels.service';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { successResponse, paginatedResponse } from '../../utils/response.util';
import { User, UserRole } from '../../users/entities/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { TenantGuard } from '../../auth/tenant.guard';
import { WarehouseGuard } from '../../auth/warehouse.guard';

@ApiTags('Stock Levels')
@ApiBearerAuth()
@Controller('stock-levels')
@UseGuards(TenantGuard, WarehouseGuard)
export class StockLevelsController {
  constructor(private readonly stockLevelsService: StockLevelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all stock levels, optionally filtered by warehouse' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findAll(@Query() query: StockLevelQueryDto, @CurrentUser() user: UserResponseDto) {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) && user.warehouseId) {
      query.warehouseId = user.warehouseId;
    }
    
    if (query.warehouseId) {
      const { data, total } = await this.stockLevelsService.findByWarehouse(user.tenantId!, query.warehouseId, query);
      return paginatedResponse(data, query.page!, query.limit!, total);
    }
    const data = await this.stockLevelsService.findAll(user.tenantId!, query);
    return paginatedResponse(data.data, query.page!, query.limit!, data.total);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'List low-stock items based on user role and permissions' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findLowStock(@Request() req: { user: User }) {
    const data = await this.stockLevelsService.findLowStockForUser(req.user);
    return successResponse(data);
  }
}
