import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovement } from './entities/stock-movement.entity';
import { StockLevel } from '../stock-levels/entities/stock-level.entity';
import { StockMovementService } from './stock-movement.service';
import { StockMovementController } from './stock-movement.controller';
import { StockMovementMapper } from './mappers/stock-movement.mapper';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockMovement, StockLevel]),
  ],
  controllers: [StockMovementController],
  providers: [StockMovementService, StockMovementMapper],
  exports: [StockMovementService, StockMovementMapper],
})
export class StockMovementModule {}
