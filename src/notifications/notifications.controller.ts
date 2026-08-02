import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { paginatedResponse, successResponse } from '../utils/response.util';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  async findAll(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const { data, total } = await this.service.findAll(user, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the number of unread notifications' })
  async unreadCount(@CurrentUser() user: UserResponseDto) {
    return successResponse({ count: await this.service.unreadCount(user) });
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: UserResponseDto) {
    return successResponse(await this.service.markAllAsRead(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single notification' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOkResponse({ type: NotificationResponseDto })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserResponseDto,
  ) {
    return successResponse(await this.service.findOne(user, id));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOkResponse({ type: NotificationResponseDto })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserResponseDto,
  ) {
    return successResponse(await this.service.markAsRead(user, id));
  }
}
