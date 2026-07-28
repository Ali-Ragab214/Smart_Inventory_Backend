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
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { TransitionDto } from './dto/transition.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { successResponse, paginatedResponse } from '../utils/response.util';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto) {
    const data = await this.service.create(dto);
    return successResponse(data);
  }

  @Get()
  async findAll(@Query() query: PurchaseOrderQueryDto) {
    const { data, total } = await this.service.findAll(query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id);
    return successResponse(data);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    const data = await this.service.transition(id, dto.status);
    return successResponse(data);
  }
}
