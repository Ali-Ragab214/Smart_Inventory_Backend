import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Forecast } from './entities/forecast.entity';
import { Campaign } from './entities/campaign.entity';
import { ForecastService } from './forecast.service';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [TypeOrmModule.forFeature([Forecast, Campaign])],
  providers: [ForecastService, CampaignsService],
  exports: [ForecastService, CampaignsService],
})
export class ForecastsModule {}