import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { SkuModule } from './sku/sku.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { VendorsModule } from './vendors/vendors.module';
import { AgentsModule } from './agents/agents.module';
import { CategoriesModule } from './categories/categories.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { StockLevelsModule } from './inventory/stock-levels/stock-levels.module';
import { KnowledgeChunksModule } from './knowledge-chunks/knowledge-chunks.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("DB_HOST", "localhost"),
        port: parseInt(config.get<string>("DB_PORT", "5432"), 10),
        username: config.get<string>("DB_USERNAME", "root"),
        password: config.get<string>("DB_PASSWORD", "your_password"),
        database: config.get<string>("DB_NAME", "smart_inventory"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        synchronize: config.get<string>("NODE_ENV") !== "production",
        logging: config.get<string>("NODE_ENV") === "development",
      }),
    }),

    SkuModule,
    AuthModule,
    UsersModule,
    PurchaseOrdersModule,
    InventoryModule,
    VendorsModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: parseInt(config.get<string>('REDIS_PORT', '6379'), 10),
        },
      }),
    }),
    AgentsModule,
    CategoriesModule,
    WarehousesModule,
    StockLevelsModule,
    KnowledgeChunksModule,
    RagModule,
  ],
})
export class AppModule {}
