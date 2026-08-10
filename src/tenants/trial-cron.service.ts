import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class TrialCronService {
  private readonly logger = new Logger(TrialCronService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly emailService: EmailService,
  ) {}

  // Run every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleTrialExpirations() {
    this.logger.log('Running daily trial expiration check...');
    const now = new Date();
    
    // 1. Handle Expirations (trialEndsAt is strictly in the past, and status is still 'trialing')
    const expiredTenants = await this.tenantRepository.find({
      where: {
        subscriptionStatus: 'trialing',
        trialEndsAt: LessThan(now),
      },
      relations: ['users'],
    });

    for (const tenant of expiredTenants) {
      tenant.subscriptionStatus = 'past_due';
      await this.tenantRepository.save(tenant);
      
      this.logger.log(`Tenant ${tenant.id} trial expired. Set to past_due.`);
      await this.emailService.sendTrialExpired(tenant.users);
    }

    // 2. Handle 3-Day Warnings
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);
    
    // We look for trials ending between 2 and 3 days from now to avoid sending the email multiple times
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(now.getDate() + 2);

    const warningTenants = await this.tenantRepository.find({
      where: {
        subscriptionStatus: 'trialing',
        trialEndsAt: Between(twoDaysFromNow, threeDaysFromNow),
      },
      relations: ['users'],
    });

    for (const tenant of warningTenants) {
      this.logger.log(`Sending 3-day trial warning to Tenant ${tenant.id}.`);
      await this.emailService.sendTrialEndingWarning(tenant.users);
    }
    
    this.logger.log(`Trial check complete. Expired: ${expiredTenants.length}, Warnings sent: ${warningTenants.length}`);
  }
}
