import {
  Controller,
  Get,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StockLevelsService } from './stock-levels.service';
import { StockLevelResponseDto } from './dto/stock-level-response.dto';
import { successResponse } from '../../utils/response.util';
import { User } from '../../users/entities/user.entity';

@ApiTags('Stock Levels')
@ApiBearerAuth()
@Controller('stock-levels')
export class StockLevelsController {
  constructor(private readonly stockLevelsService: StockLevelsService) {}

  @Get('low-stock')
  @ApiOperation({ summary: 'List low-stock items based on user role and permissions' })
  @ApiOkResponse({ type: StockLevelResponseDto, isArray: true })
  async findLowStock(@Request() req: { user: User }) {
    const data = await this.stockLevelsService.findLowStockForUser(req.user);
    return successResponse(data);
  }
}
