import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant } from './entities/tenant.entity';
import { TrialCronService } from './trial-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
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
