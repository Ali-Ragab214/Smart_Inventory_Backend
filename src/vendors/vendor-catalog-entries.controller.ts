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
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VendorCatalogEntriesService } from './vendor-catalog-entries.service';
import { CreateVendorCatalogEntryDto } from './dto/create-vendor-catalog-entry.dto';
import { UpdateVendorCatalogEntryDto } from './dto/update-vendor-catalog-entry.dto';
import { VendorCatalogEntryResponseDto } from './dto/vendor-catalog-entry-response.dto';
import { VendorCatalogEntryQueryDto } from './dto/vendor-catalog-entry-query.dto';
import { successResponse, paginatedResponse } from '../utils/response.util';

@ApiTags('vendors')
@Controller('vendors/:vendorId/catalog-entries')
export class VendorCatalogEntriesController {
  constructor(
    private readonly catalogService: VendorCatalogEntriesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a catalog entry for a vendor' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiCreatedResponse({ type: VendorCatalogEntryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  async create(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Body() dto: CreateVendorCatalogEntryDto,
  ) {
    const data = await this.catalogService.create(vendorId, dto);
    return successResponse(data);
  }

  @Get()
  @ApiOperation({ summary: 'List catalog entries for a vendor' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiOkResponse({ type: VendorCatalogEntryResponseDto, isArray: true })
  async findAll(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Query() query: VendorCatalogEntryQueryDto,
  ) {
    const { data, total } = await this.catalogService.findAll(vendorId, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a catalog entry by ID' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiParam({ name: 'id', description: 'Catalog Entry UUID' })
  @ApiOkResponse({ type: VendorCatalogEntryResponseDto })
  @ApiNotFoundResponse({ description: 'Catalog entry not found' })
  async findOne(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.catalogService.findOne(vendorId, id);
    return successResponse(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a catalog entry' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiParam({ name: 'id', description: 'Catalog Entry UUID' })
  @ApiOkResponse({ type: VendorCatalogEntryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiNotFoundResponse({ description: 'Catalog entry not found' })
  async update(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorCatalogEntryDto,
  ) {
    const data = await this.catalogService.update(vendorId, id, dto);
    return successResponse(data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a catalog entry' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiParam({ name: 'id', description: 'Catalog Entry UUID' })
  @ApiOkResponse({ description: 'Catalog entry deleted successfully' })
  @ApiNotFoundResponse({ description: 'Catalog entry not found' })
  async remove(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.catalogService.remove(vendorId, id);
    return successResponse(null);
  }
}
