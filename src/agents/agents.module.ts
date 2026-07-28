import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { ApprovalRequest } from './entities/approval-request.entity';
import { AnomalyFlag } from './entities/anomaly-flag.entity';
import { User } from '../users/entities/user.entity';
import { AnomalyFlagsService } from './anomaly-flags.service';
import { AnomalyFlagsController } from './anomaly-flags.controller';
import { ApprovalQueueService } from './approval-queue.service';
import { ApprovalQueueController } from './approval-queue.controller';
import { LLMService } from './llm.service';
import { AgentRunService } from './agent-run.service';
import { AgentRunController } from './agent-run.controller';
import { AgentsProcessor } from './agents.processor';
import { AgentRunMapper } from './mappers/agent-run.mapper';
import { ApprovalRequestMapper } from './mappers/approval-request.mapper';
import { AnomalyFlagMapper } from './mappers/anomaly-flag.mapper';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentStep, ApprovalRequest, AnomalyFlag, User]),
    BullModule.registerQueue({ name: 'agent-jobs' }),
  ],
  controllers: [ApprovalQueueController, AgentRunController, AnomalyFlagsController],
  providers: [
    LLMService,
    AnomalyFlagsService,
    ApprovalQueueService,
    AgentRunService,
    AgentsProcessor,
    AgentRunMapper,
    ApprovalRequestMapper,
    AnomalyFlagMapper,
  ],
  exports: [LLMService, ApprovalQueueService, AgentRunService],
})
export class AgentsModule {}
