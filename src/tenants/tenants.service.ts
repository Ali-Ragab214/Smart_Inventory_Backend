import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({ message: 'The specified tenant could not be found.', code: 'TENANT_NOT_FOUND' });
    }

    if (dto.name !== undefined) {
      tenant.name = dto.name;
    }

    return this.tenantRepository.save(tenant);
  }
}
