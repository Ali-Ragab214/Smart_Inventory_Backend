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
import { ApproveApprovalRequestDto, EditApprovalRequestDto, NegotiateApprovalRequestDto, RejectApprovalRequestDto } from './dto/approval-action.dto';
import { ApprovalRequestResponseDto } from './dto/approval-request-response.dto';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalQueueController {
  constructor(private readonly service: ApprovalQueueService) {}

  @Get()
  @ApiOperation({ summary: 'List approval requests (optionally filtered by status)' })
  @ApiOkResponse({ type: ApprovalRequestResponseDto, isArray: true })
  async findAll(@Query() query: ApprovalQueryDto, @CurrentUser() user: UserResponseDto) {
    const { data, total } = await this.service.findAll(user, query);
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
    const data = await this.service.approve(user, id, body.reviewedBy, body.editedPayload);
    return successResponse(data);
  }

  @Post(':id/edit')
  @ApiOperation({ summary: 'Persist draft edits on a pending approval request' })
  @ApiParam({ name: 'id', description: 'Approval request UUID' })
  @ApiBody({ type: EditApprovalRequestDto })
  @ApiOkResponse({ type: ApprovalRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EditApprovalRequestDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.service.editDraft(user, id, body.editedPayload);
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
    const data = await this.service.reject(user, id, body.reviewedBy);
    return successResponse(data);
  }

  @Post(':id/negotiate')
  @ApiOperation({ summary: 'Defer a reorder approval to the negotiation agent' })
  @ApiParam({ name: 'id', description: 'Approval request UUID' })
  @ApiBody({ type: NegotiateApprovalRequestDto })
  @ApiCreatedResponse({ type: ApprovalRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async negotiate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: NegotiateApprovalRequestDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.service.negotiate(user, id, body.reviewedBy);
    return successResponse(data);
  }
}
