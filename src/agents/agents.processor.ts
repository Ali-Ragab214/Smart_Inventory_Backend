import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AgentType } from './agent-run.service';

@Processor('agent-jobs')
export class AgentsProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentsProcessor.name);

  async process(job: Job<{ runId: string; agentType: AgentType }>): Promise<void> {
    if (job.name === 'run-agent-step') {
      this.logger.log(
        `Processing agent job: ${job.data.agentType} run ${job.data.runId}`,
      );
    }
  }
}
