import { Body, Controller, Param, ParseUUIDPipe, Patch, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Roles } from '../auth/roles.decorator';
import { successResponse } from '../utils/response.util';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get(':id')
  @Roles('super_admin', 'tenant_owner')
  @ApiOperation({ summary: 'Get a tenant by id' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOkResponse({ description: 'Tenant retrieved successfully' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserResponseDto
  ) {
    if (user.role === 'tenant_owner' && user.tenantId !== id) {
      throw new Error('Forbidden resource');
    }
    const data = await this.tenantsService.findById(id);
    return successResponse(data);
  }

  @Patch(':id')
  @Roles('super_admin', 'tenant_owner')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOkResponse({ description: 'Tenant updated successfully' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: UserResponseDto
  ) {
    // Basic authorization check: tenant owners can only update their own tenant
    if (user.role === 'tenant_owner' && user.tenantId !== id) {
      throw new Error('Forbidden resource');
    }
    const data = await this.tenantsService.update(id, dto);
    return successResponse(data);
  }
}
