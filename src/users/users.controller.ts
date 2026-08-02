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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Roles } from '../auth/roles.decorator';
import { PaginationQueryDto } from '../utils/query.dto';
import { successResponse, paginatedResponse } from '../utils/response.util';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager', 'admin')
  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const { data, total } = await this.usersService.findAll(query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async findMe(@Req() req: any) {
    const data = await this.usersService.findMe(req.user.id);
    return successResponse(data);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async updateMe(@Req() req: any, @Body() updateProfileDto: UpdateProfileDto) {
    const data = await this.usersService.updateMe(req.user.id, updateProfileDto);
    return successResponse(data);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.usersService.findById(id);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager', 'admin')
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const data = await this.usersService.create(createUserDto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager', 'admin')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const data = await this.usersService.update(id, updateUserDto);
    return successResponse(data);
  }

  @Roles('super_admin', 'tenant_owner', 'warehouse_manager', 'admin')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.remove(id);
    return successResponse(null);
  }
}
