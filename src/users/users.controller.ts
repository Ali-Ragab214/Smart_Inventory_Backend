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
import { successResponse, paginatedResponse } from '../utils/response.util';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager')
  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const { data, total } = await this.usersService.findAll(query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.usersService.findById(id);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager')
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const data = await this.usersService.create(createUserDto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const data = await this.usersService.update(id, updateUserDto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.remove(id);
    return successResponse(null);
  }
}
