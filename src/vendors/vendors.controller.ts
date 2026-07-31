
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';
import { VendorQueryDto } from './dto/vendor-query.dto';
import { successResponse, paginatedResponse } from '../utils/response.util';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a vendor' })
  @ApiCreatedResponse({ type: VendorResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async create(@Body() dto: CreateVendorDto, @CurrentUser() user: UserResponseDto) {
    const data = await this.vendorsService.create(user.tenantId!, dto);
    return successResponse(data);
  }

  @Get()
  @ApiOperation({ summary: 'List vendors' })
  @ApiOkResponse({ type: VendorResponseDto, isArray: true })
  async findAll(@Query() query: VendorQueryDto, @CurrentUser() user: UserResponseDto) {
    const { data, total } = await this.vendorsService.findAll(user.tenantId!, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a vendor by ID' })
  @ApiParam({ name: 'id', description: 'Vendor UUID' })
  @ApiOkResponse({ type: VendorResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    const data = await this.vendorsService.findOne(user.tenantId!, id);
    return successResponse(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vendor' })
  @ApiParam({ name: 'id', description: 'Vendor UUID' })
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.vendorsService.update(user.tenantId!, id, dto);
    return successResponse(data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a vendor' })
  @ApiParam({ name: 'id', description: 'Vendor UUID' })
  @ApiOkResponse({ description: 'Vendor deleted successfully' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    await this.vendorsService.remove(user.tenantId!, id);
    return successResponse(null);
  }
}
