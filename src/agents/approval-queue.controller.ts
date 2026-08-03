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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApprovalQueueService } from './approval-queue.service';
import { paginatedResponse, successResponse } from '../utils/response.util';
import { ApprovalQueryDto } from './dto/approval-query.dto';
import { ApproveApprovalRequestDto, RejectApprovalRequestDto } from './dto/approval-action.dto';
import { ApprovalRequestResponseDto } from './dto/approval-request-response.dto';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalQueueController {
  constructor(private readonly service: ApprovalQueueService) {}

  @Get()
  @ApiOperation({ summary: 'List pending approval requests' })
  @ApiOkResponse({ type: ApprovalRequestResponseDto, isArray: true })
  async findAll(@Query() query: ApprovalQueryDto, @CurrentUser() user: UserResponseDto) {
    const { data, total } = await this.service.findPending(user.tenantId!, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve an approval request' })
  @ApiParam({ name: 'id', description: 'Approval request UUID' })
  @ApiBody({ type: ApproveApprovalRequestDto })
  @ApiCreatedResponse({ type: ApprovalRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveApprovalRequestDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.service.approve(user.tenantId!, id, body.reviewedBy, body.editedPayload);
    return successResponse(data);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject an approval request' })
  @ApiParam({ name: 'id', description: 'Approval request UUID' })
  @ApiBody({ type: RejectApprovalRequestDto })
  @ApiOkResponse({ type: ApprovalRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectApprovalRequestDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.service.reject(user.tenantId!, id, body.reviewedBy);
    return successResponse(data);
  }
}
