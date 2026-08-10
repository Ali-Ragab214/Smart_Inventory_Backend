import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant } from './entities/tenant.entity';
import { TrialCronService } from './trial-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    NotificationsModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService, TrialCronService],
  exports: [TenantsService],
})
export class TenantsModule {}
