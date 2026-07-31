import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiParam,
} from '@nestjs/swagger';
import 'multer';
import { SkuService } from './sku.service';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { SkuResponseDto } from './dto/sku-response.dto';
import { SkuQueryDto } from './dto/sku-query.dto';
import { CsvImportResponseDto } from './dto/csv-import-response.dto';
import { successResponse, paginatedResponse } from '../utils/response.util';

@ApiTags('sku')
@Controller('sku')
export class SkuController {
  constructor(private readonly skuService: SkuService) {}

  @Post()
  @ApiOperation({ summary: 'Create a single SKU' })
  @ApiOkResponse({ type: SkuResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  async create(@Body() createSkuDto: CreateSkuDto, @CurrentUser() user: UserResponseDto) {
    const data = await this.skuService.create(user.tenantId!, createSkuDto);
    return successResponse(data);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import SKUs from a CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV file containing SKUs (UTF-8 formatted)',
        },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'CSV import result summary detailing successful and failed rows',
    type: CsvImportResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Missing CSV file, malformed CSV, or invalid file extension' })
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: UserResponseDto) {
    if (!file) {
      throw new BadRequestException({ message: 'Please upload a CSV file to proceed.', code: 'MISSING_CSV_FILE' });
    }

    if (file.originalname && !file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException({ message: 'The uploaded file format is not supported. Please ensure it is a valid CSV.', code: 'INVALID_FILE_FORMAT' });
    }

    const data = await this.skuService.importCsv(user.tenantId!, file.buffer);
    return successResponse(data);
  }

  @Get()
  @ApiOperation({ summary: 'List SKUs' })
  @ApiOkResponse({ type: SkuResponseDto, isArray: true })
  async findAll(@Query() query: SkuQueryDto, @CurrentUser() user: UserResponseDto) {
    const { data, total } = await this.skuService.findAll(user.tenantId!, query);
    return paginatedResponse(data, query.page!, query.limit!, total);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a SKU by ID' })
  @ApiParam({ name: 'id', description: 'SKU UUID' })
  @ApiOkResponse({ type: SkuResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    const data = await this.skuService.findOne(user.tenantId!, id);
    return successResponse(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a SKU' })
  @ApiParam({ name: 'id', description: 'SKU UUID' })
  @ApiOkResponse({ type: SkuResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSkuDto: UpdateSkuDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    const data = await this.skuService.update(user.tenantId!, id, updateSkuDto);
    return successResponse(data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a SKU' })
  @ApiParam({ name: 'id', description: 'SKU UUID' })
  @ApiOkResponse({ description: 'SKU deleted successfully' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserResponseDto) {
    await this.skuService.remove(user.tenantId!, id);
    return successResponse(null);
  }
}
