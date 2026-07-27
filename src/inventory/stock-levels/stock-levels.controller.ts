import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StockLevelsService } from './stock-levels.service';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { successResponse, paginatedResponse } from '../../utils/response.util';

@ApiTags('stock-levels')
@ApiBearerAuth()
@Controller('stock-levels')
export class StockLevelsController {
  constructor(private readonly stockLevelsService: StockLevelsService) {}


  @Get()
  @ApiOperation({ summary: 'List all stock levels (filterable by skuId / warehouseId)' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findAll(@Query() query: StockLevelQueryDto) {
    const { data, total } = await this.stockLevelsService.findAll(query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  
  @Get('low-stock')
  @ApiOperation({ summary: 'List stock levels at or below reorder threshold' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findLowStock() {
    const data = await this.stockLevelsService.findLowStock();
    return successResponse(data);
  }

  
  @Get(':id')
  @ApiOperation({ summary: 'Get a stock level by ID' })
  @ApiParam({ name: 'id', description: 'StockLevel UUID' })
  @ApiOkResponse({ type: StockLevelResponseDto })
  @ApiNotFoundResponse({ description: 'Stock level not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.stockLevelsService.findOne(id);
    return successResponse(data);
  }

  
  @Patch(':id')
  @ApiOperation({ summary: 'Update reorderThreshold / safetyStock on a stock level' })
  @ApiParam({ name: 'id', description: 'StockLevel UUID' })
  @ApiOkResponse({ type: StockLevelResponseDto })
  @ApiNotFoundResponse({ description: 'Stock level not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockLevelDto,
  ) {
    const data = await this.stockLevelsService.update(id, dto);
    return successResponse(data);
  }
}
