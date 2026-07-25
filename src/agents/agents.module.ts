import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { ApprovalRequest } from './entities/approval-request.entity';
import { AnomalyFlag } from './entities/anomaly-flag.entity';
import { User } from '../users/entities/user.entity';
import { ApprovalQueueService } from './approval-queue.service';
import { ApprovalQueueController } from './approval-queue.controller';
import { LLMService } from './llm.service';
import { AgentRunService } from './agent-run.service';
import { AgentRunController } from './agent-run.controller';
import { AgentsProcessor } from './agents.processor';
import { AgentRunMapper } from './mappers/agent-run.mapper';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentStep, ApprovalRequest, AnomalyFlag, User]),
    BullModule.registerQueue({ name: 'agent-jobs' }),
  ],
  controllers: [ApprovalQueueController, AgentRunController],
  providers: [
    LLMService,
    ApprovalQueueService,
    AgentRunService,
    AgentsProcessor,
    AgentRunMapper,
    ApprovalRequestMapper,
  ],
  exports: [LLMService, ApprovalQueueService, AgentRunService],
})
export class AgentsModule {}
