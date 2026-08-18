import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/entities/user.entity';
import { TenantGuard } from '../auth/tenant.guard';
import { WarehouseGuard } from '../auth/warehouse.guard';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { TransitionDto } from './dto/transition.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { successResponse, paginatedResponse } from '../utils/response.util';

@Controller('purchase-orders')
@UseGuards(TenantGuard, WarehouseGuard)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: UserResponseDto) {
    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      dto.warehouseId = user.warehouseId;
    }
    const data = await this.service.create(user.tenantId!, dto);
    return successResponse(data);
  }

  @Get()
  async findAll(@Query() query: PurchaseOrderQueryDto, @CurrentUser() user: UserResponseDto) {
    if (user.role === UserRole.WAREHOUSE_MANAGER && user.warehouseId) {
      query.warehouseId = user.warehouseId;
    }
    const { data, total } = await this.service.findAll(user.tenantId!, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    const data = await this.service.findOne(user, id);
    return successResponse(data);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.service.transition(user, id, dto.status, dto);
    return successResponse(data);
  }
}
