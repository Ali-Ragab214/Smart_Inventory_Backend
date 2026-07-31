import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AnomalyFlagsService } from './anomaly-flags.service';
import { CreateAnomalyFlagDto } from './dto/create-anomaly-flag.dto';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';
import { ReviewAnomalyFlagDto } from './dto/review-anomaly-flag.dto';
import { AnomalyFlagResponseDto } from './dto/anomaly-flag-response.dto';
import { paginatedResponse, successResponse } from '../utils/response.util';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('anomalies')
@ApiBearerAuth()
@Controller('anomalies')
export class AnomalyFlagsController {
  constructor(private readonly service: AnomalyFlagsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an anomaly flag' })
  @ApiBody({ type: CreateAnomalyFlagDto })
  @ApiCreatedResponse({ type: AnomalyFlagResponseDto })
  async create(@Body() body: CreateAnomalyFlagDto, @CurrentUser() user: UserResponseDto) {
    const data = await this.service.create(user.tenantId!, body);
    return successResponse(data);
  }

  @Get()
  @ApiOperation({ summary: 'List anomaly flags, optionally filtered by status' })
  @ApiOkResponse({ type: AnomalyFlagResponseDto, isArray: true })
  async findAll(@Query() query: AnomalyQueryDto, @CurrentUser() user: UserResponseDto) {
    const { data, total } = await this.service.findAll(
      user.tenantId!,
      query.status,
      query.page,
      query.limit,
    );
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Mark an anomaly flag as reviewed' })
  @ApiParam({ name: 'id', description: 'Anomaly flag UUID' })
  @ApiBody({ type: ReviewAnomalyFlagDto })
  @ApiCreatedResponse({ type: AnomalyFlagResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiNotFoundResponse({ description: 'Anomaly flag not found' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewAnomalyFlagDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.service.markReviewed(user.tenantId!, id, body.reviewedBy);
    return successResponse(data);
  }

  @Post(':id/escalate')
  @ApiOperation({ summary: 'Escalate an anomaly flag for deeper investigation' })
  @ApiParam({ name: 'id', description: 'Anomaly flag UUID' })
  @ApiCreatedResponse({ type: AnomalyFlagResponseDto })
  @ApiNotFoundResponse({ description: 'Anomaly flag not found' })
  async escalate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    const data = await this.service.escalate(user.tenantId!, id);
    return successResponse(data);
  }
}
