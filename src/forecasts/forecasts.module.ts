import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Forecast } from './entities/forecast.entity';
import { ForecastService } from './forecast.service';

@Module({
  imports: [TypeOrmModule.forFeature([Forecast])],
  providers: [ForecastService],
  exports: [ForecastService],
})
export class ForecastsModule {}