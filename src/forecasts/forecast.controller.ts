import {
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ForecastService } from './forecast.service';
import { ForecastSchedulerService } from './forecast-scheduler.service';
import { successResponse } from '../utils/response.util';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('forecasts')
@ApiBearerAuth()
@Controller('forecasts')
export class ForecastController {
  constructor(
    private readonly service: ForecastService,
    private readonly scheduler: ForecastSchedulerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List forecasts, optionally filtered by SKU and period window' })
  @ApiQuery({ name: 'skuId', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'periodStart >= from (ISO)' })
  @ApiQuery({ name: 'to', required: false, description: 'periodEnd <= to (ISO)' })
  @ApiOkResponse({ description: 'Forecast rows for the tenant' })
  async findAll(
    @Query('skuId') skuId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser() user?: UserResponseDto,
  ) {
    const tenantId = (user?.tenantId ?? '') as string;
    const data = skuId
      ? await this.service.findForSku(
          tenantId,
          skuId,
          from ? new Date(from) : undefined,
          to ? new Date(to) : undefined,
        )
      : await this.service.findRecent(tenantId, []);
    return successResponse(data);
  }

  @Post('run')
  @ApiOperation({ summary: 'Trigger the forecasting pipeline manually (all top-mover SKUs for your tenant)' })
  @ApiOkResponse({ description: 'Forecast runs queued' })
  async runForTenant(@CurrentUser() user: UserResponseDto) {
    const queued = await this.scheduler.triggerForTenant(user.tenantId!);
    return successResponse({ queued });
  }
}