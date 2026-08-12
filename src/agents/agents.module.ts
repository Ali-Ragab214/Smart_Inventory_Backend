import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { ApprovalRequest } from './entities/approval-request.entity';
import { AgentTool } from './entities/agent-tool.entity';
import { User } from '../users/entities/user.entity';
import { SkuModule } from '../sku/sku.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VendorsModule } from '../vendors/vendors.module';
import { ApprovalQueueService } from './approval-queue.service';
import { ApprovalQueueController } from './approval-queue.controller';
import { LLMService } from './llm.service';
import { AgentRunService } from './agent-run.service';
import { AgentRunController } from './agent-run.controller';
import { AgentsProcessor } from './agents.processor';
import { GatewayLlmService } from './gateway-llm.service';
import { AgentRunMapper } from './mappers/agent-run.mapper';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';
import { InventoryService } from './inventory.service';
import { ToolExecutorService } from './tool-executor.service';
import { MastraService } from './mastra.service';
import { MemoryManagerService } from './memory-manager.service';
import { MemoryConsolidationCronService } from './memory-consolidation.cron.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { SimulatedVendorService } from './simulated-vendor.service';
import { NegotiationStateMachineService } from './negotiation-state-machine.service';
import { VendorChannelService } from './vendor-channel/vendor-channel.service';
import { VendorEmailService } from './vendor-channel/vendor-email.service';
import { VendorReplyParser } from './vendor-channel/vendor-reply.parser';
import { VendorInboundMailService } from './vendor-channel/vendor-inbound-mail.service';
import { VendorChannelController } from './vendor-channel/vendor-channel.controller';
import { VendorNegotiationProfile } from './entities/vendor-negotiation-profile.entity';
import { RagModule } from '../rag/rag.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { ForecastsModule } from '../forecasts/forecasts.module';
import { ForecastSchedulerService } from '../forecasts/forecast-scheduler.service';
import { ForecastController } from '../forecasts/forecast.controller';
import { Sku } from '../sku/entities/sku.entity';
import { StockMovement } from '../inventory/stock-movements/entities/stock-movement.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentStep, ApprovalRequest, AgentTool, User, VendorNegotiationProfile, Sku, StockMovement]),
    BullModule.registerQueue({ name: 'agent-jobs' }),
    SkuModule,
    InventoryModule,
    VendorsModule,
    RagModule,
    PurchaseOrdersModule,
    ForecastsModule,
  ],
  controllers: [ApprovalQueueController, AgentRunController, ForecastController, VendorChannelController],
  providers: [
    LLMService,
    ApprovalQueueService,
    AgentRunService,
    AgentsProcessor,
    GatewayLlmService,
    AgentRunMapper,
    ApprovalRequestMapper,
    InventoryService,
    ToolExecutorService,
    MemoryManagerService,
    MemoryConsolidationCronService,
    MastraService,
    AgentSchedulerService,
    SimulatedVendorService,
    NegotiationStateMachineService,
    VendorChannelService,
    VendorEmailService,
    VendorReplyParser,
    VendorInboundMailService,
    ForecastSchedulerService,
  ],
  exports: [LLMService, ApprovalQueueService, AgentRunService, ToolExecutorService, MemoryManagerService, MastraService, GatewayLlmService, SimulatedVendorService, VendorChannelService, VendorEmailService, VendorInboundMailService],
})
export class AgentsModule {}
