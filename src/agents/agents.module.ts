import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { ApprovalRequest } from './entities/approval-request.entity';
import { AnomalyFlag } from './entities/anomaly-flag.entity';
import { User } from '../users/entities/user.entity';
import { SkuModule } from '../sku/sku.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AnomalyFlagsService } from './anomaly-flags.service';
import { AnomalyFlagsController } from './anomaly-flags.controller';
import { ApprovalQueueService } from './approval-queue.service';
import { ApprovalQueueController } from './approval-queue.controller';
import { LLMService } from './llm.service';
import { AgentRunService } from './agent-run.service';
import { AgentRunController } from './agent-run.controller';
import { AgentsProcessor } from './agents.processor';
import { GatewayLlmService } from './gateway-llm.service';
import { AgentRunMapper } from './mappers/agent-run.mapper';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';
import { AnomalyFlagMapper } from './mappers/anomaly-flag.mapper';
import { InventoryService } from './inventory.service';
import { ToolExecutorService } from './tool-executor.service';
import { MastraService } from './mastra.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { SimulatedVendorService } from './simulated-vendor.service';
import { NegotiationStateMachineService } from './negotiation-state-machine.service';
import { VendorNegotiationProfile } from './entities/vendor-negotiation-profile.entity';
import { RagModule } from '../rag/rag.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentStep, ApprovalRequest, AnomalyFlag, User, VendorNegotiationProfile]),
    BullModule.registerQueue({ name: 'agent-jobs' }),
    SkuModule,
    InventoryModule,
    VendorsModule,
    RagModule,
    PurchaseOrdersModule,
  ],
  controllers: [ApprovalQueueController, AgentRunController, AnomalyFlagsController],
  providers: [
    LLMService,
    AnomalyFlagsService,
    ApprovalQueueService,
    AgentRunService,
    AgentsProcessor,
    GatewayLlmService,
    AgentRunMapper,
    ApprovalRequestMapper,
    AnomalyFlagMapper,
    InventoryService,
    ToolExecutorService,
    MastraService,
    AgentSchedulerService,
    SimulatedVendorService,
    NegotiationStateMachineService,
  ],
  exports: [LLMService, ApprovalQueueService, AgentRunService, ToolExecutorService, MastraService, GatewayLlmService, SimulatedVendorService],
})
export class AgentsModule {}
