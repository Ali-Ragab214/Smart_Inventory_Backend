import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  StockMovementService,
} from './stock-movement.service';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { StockMovementResponseDto } from './dto/stock-movement-response.dto';
import { successResponse, paginatedResponse } from '../../utils/response.util';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { TenantGuard } from '../../auth/tenant.guard';
import { WarehouseGuard } from '../../auth/warehouse.guard';

@ApiTags('Stock Movements')
@ApiBearerAuth()
@Controller('inventory/stock-movements')
@UseGuards(TenantGuard, WarehouseGuard)
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  /**
   * POST /inventory/stock-movements
   *
   * Record a stock movement with full idempotency support.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a stock movement' })
  @ApiCreatedResponse({ type: StockMovementResponseDto })
  async recordMovement(@Body() dto: RecordMovementDto, @CurrentUser() user: UserResponseDto) {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) && user.warehouseId) {
      dto.warehouseId = user.warehouseId;
    }
    const data = await this.stockMovementService.recordMovement(user.tenantId!, {
      skuId: dto.skuId,
      warehouseId: dto.warehouseId,
      reason: dto.reason,
      quantityChange: dto.quantityChange,
      idempotencyKey: dto.idempotencyKey ?? randomUUID(),
      performedByUserId: dto.performedByUserId,
      note: dto.note,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
    });
    return successResponse(data);
  }

  /**
   * POST /inventory/stock-movements/transfer
   *
   * Atomically transfer stock from one warehouse to another.
   * Records both a TRANSFER_OUT (source) and TRANSFER_IN (destination) movement.
   */
  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Transfer stock between warehouses' })
  async transfer(@Body() dto: TransferStockDto, @CurrentUser() user: UserResponseDto) {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) && user.warehouseId) {
      dto.fromWarehouseId = user.warehouseId;
    }
    const data = await this.stockMovementService.transfer(user.tenantId!, {
      skuId: dto.skuId,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      quantity: dto.quantity,
      idempotencyKey: dto.idempotencyKey ?? randomUUID(),
      performedByUserId: dto.performedByUserId,
      note: dto.note,
    });
    return successResponse(data);
  }

  /**
   * GET /inventory/stock-movements
   *
   * Recent movements across all SKUs, newest-first.
   * Query params: `warehouseId`, `limit`.
   */
  @Get()
  async getRecentMovements(
    @Query('warehouseId') warehouseId?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
    @CurrentUser() user?: UserResponseDto,
  ) {
    if ((user?.role === UserRole.WAREHOUSE_MANAGER || user?.role === UserRole.CLERK) && user?.warehouseId) {
      warehouseId = user.warehouseId;
    }
    const data = await this.stockMovementService.getRecentMovements(user!.tenantId!, warehouseId, limit);
    return successResponse(data);
  }

  /**
   * GET /inventory/stock-movements/sku/:skuId
   *
   * Paginated, filterable history of all stock movements for a single SKU,
   * returned newest-first.
   *
   * Query params: `from`, `to` (ISO-8601 dates), `reason` (MovementReason),
   * `page`, `limit`.
   */
  @Get('sku/:skuId')
  async getHistoryForSku(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @Query() query: StockMovementQueryDto,
    @CurrentUser() user?: UserResponseDto,
  ) {
    let warehouseId: string | undefined = undefined;
    if ((user?.role === UserRole.WAREHOUSE_MANAGER || user?.role === UserRole.CLERK) && user?.warehouseId) {
      warehouseId = user.warehouseId;
    }
    const { data, total } = await this.stockMovementService.getHistoryForSku(user!.tenantId!, skuId, query, warehouseId);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  /**
   * GET /inventory/stock-movements/sku/:skuId/reconcile?warehouseId=:warehouseId
   *
   * Integrity check: re-sums the ledger and compares it to the cached
   * `StockLevel.quantity`.  Returns `{ cached, calculated, matches }`.
   *
   * Not on the hot path — intended for admin / cron use.
   */
  @Get('sku/:skuId/reconcile')
  async reconcileBalance(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @Query('warehouseId', ParseUUIDPipe) warehouseId: string,
    @CurrentUser() user: UserResponseDto,
  ) {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) && user.warehouseId) {
      warehouseId = user.warehouseId;
    }
    const data = await this.stockMovementService.reconcileBalance(user.tenantId!, skuId, warehouseId);
    return successResponse(data);
  }

  /**
   * GET /inventory/stock-movements/sku/:skuId/consumption?warehouseId=:warehouseId&sinceDays=30
   *
   * Returns daily net quantity changes over the last `sinceDays` calendar
   * days (default 30), ordered oldest-first.  Intended as a data feed for
   * the demand-forecasting feature.
   */
  @Get('sku/:skuId/consumption')
  async getConsumptionSeries(
    @Param('skuId', ParseUUIDPipe) skuId: string,
    @Query('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query('sinceDays', new DefaultValuePipe(30), ParseIntPipe) sinceDays: number,
    @CurrentUser() user: UserResponseDto,
  ) {
    if ((user.role === UserRole.WAREHOUSE_MANAGER || user.role === UserRole.CLERK) && user.warehouseId) {
      warehouseId = user.warehouseId;
    }
    const data = await this.stockMovementService.getConsumptionSeries(user.tenantId!, skuId, warehouseId, sinceDays);
    return successResponse(data);
  }
}
