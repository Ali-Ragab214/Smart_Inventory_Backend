import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './entities/campaign.entity';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  /**
   * Campaigns overlapping [from, to] for the tenant, optionally restricted to
   * a set of SKUs. Empty skuIds returns campaigns for any SKU (scoped broad).
   */
  async findForSkus(
    tenantId: string,
    skuIds: string[] = [],
    from: Date,
    to: Date,
  ): Promise<Campaign[]> {
    const qb = this.campaignRepo
      .createQueryBuilder('campaign')
      .where('campaign.tenantId = :tenantId', { tenantId })
      .andWhere('campaign."startDate" <= :to', { to })
      .andWhere('campaign."endDate" >= :from', { from });

    if (skuIds.length > 0) {
      qb.andWhere('campaign.skuIds && :skuIds', { skuIds });
    }

    return qb.orderBy('campaign."startDate"', 'ASC').getMany();
  }
}