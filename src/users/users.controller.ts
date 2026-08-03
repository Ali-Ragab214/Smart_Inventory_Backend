import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Roles } from '../auth/roles.decorator';
import { PaginationQueryDto } from '../utils/query.dto';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { successResponse, paginatedResponse } from '../utils/response.util';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('super_admin', 'tenant_owner')
  @Get()
  async findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: UserResponseDto) {
    const { data, total } = await this.usersService.findAll(user, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    const data = await this.usersService.findById(user, id);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner')
  @Post()
  async create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: UserResponseDto) {
    const data = await this.usersService.create(user, createUserDto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: UserResponseDto
  ) {
    const data = await this.usersService.update(user, id, updateUserDto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    await this.usersService.remove(user, id);
    return successResponse(null);
  }
}
