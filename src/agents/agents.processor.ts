import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AgentType, AgentRunService } from './agent-run.service';
import { MastraService } from './mastra.service';
import { Agent } from '@mastra/core/agent';

@Processor('agent-jobs')
export class AgentsProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentsProcessor.name);

  constructor(
    private readonly mastraService: MastraService,
    private readonly agentRunService: AgentRunService,
  ) {
    super();
  }

  async process(job: Job<{ runId: string; agentType: AgentType; tenantId: string }>): Promise<void> {
    if (job.name === 'run-agent-step') {
      const { runId, agentType, tenantId } = job.data;
      this.logger.log(`Processing agent job: ${agentType} run ${runId}`);

      const runDetails = await this.agentRunService.load(tenantId, runId);
      if (!runDetails.data) return;

      const run = runDetails.data.run;
      let agent: Agent | null = null;

      if (agentType === 'anomaly') agent = this.mastraService.anomalyAgent;
      else if (agentType === 'forecasting') agent = this.mastraService.forecastingAgent;
      else if (agentType === 'reorder') agent = this.mastraService.reorderAgent;

      if (!agent) {
        this.logger.error(`No Mastra agent found for type: ${agentType}`);
        await this.agentRunService.updateStatus(tenantId, runId, 'rejected');
        return;
      }

      try {
        const result = await agent.generate([
          {
            role: 'user',
            content: `Please execute your workflow for run ID ${runId}. Related SKUs: ${JSON.stringify(run.skuIds)}`,
          },
        ]);

        await this.agentRunService.appendStep(
          tenantId,
          runId,
          { input: `Start ${agentType} workflow` },
          { result: result.text },
          'Mastra Execution Complete'
        );

        await this.agentRunService.updateStatus(tenantId, runId, 'completed');
        this.logger.log(`Agent ${agentType} completed successfully.`);
      } catch (error) {
        this.logger.error(`Agent ${agentType} failed`, error);
        await this.agentRunService.appendStep(
          tenantId,
          runId,
          { input: `Error` },
          { error: error instanceof Error ? error.message : String(error) },
          'Mastra Execution Failed'
        );
        await this.agentRunService.updateStatus(tenantId, runId, 'escalated');
      }
    }
  }
}
