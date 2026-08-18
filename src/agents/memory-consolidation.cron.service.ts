import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';
import { RagService } from '../rag/rag.service';
import { GatewayLlmService } from './gateway-llm.service';
import { KnowledgeSourceType } from '../rag/entities/knowledge-chunk.entity';

@Injectable()
export class MemoryConsolidationCronService {
  private readonly logger = new Logger(MemoryConsolidationCronService.name);

  constructor(
    @InjectRepository(AgentRun) private readonly agentRunRepo: Repository<AgentRun>,
    @InjectRepository(AgentStep) private readonly agentStepRepo: Repository<AgentStep>,
    private readonly ragService: RagService,
    private readonly llmService: GatewayLlmService,
  ) {}

  /**
   * Runs nightly to consolidate completed negotiations into semantic memory.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async consolidateMemory() {
    this.logger.log('Starting nightly memory consolidation process...');

    // Find all completed negotiation runs that haven't been consolidated yet.
    // For this example, we assume we want all completed negotiations.
    // In a production system, you'd add a `consolidatedAt` timestamp to AgentRun.
    const runsToConsolidate = await this.agentRunRepo.find({
      where: {
        agentType: 'negotiation' as any,
        status: 'completed' as any,
      },
      order: { createdAt: 'ASC' },
      take: 50, // Process in batches
    });

    if (runsToConsolidate.length === 0) {
      this.logger.log('No new completed negotiations found for consolidation.');
      return;
    }

    for (const run of runsToConsolidate) {
      try {
        const steps = await this.agentStepRepo.find({
          where: { agentRunId: run.id },
          order: { stepNumber: 'ASC' },
        });

        if (steps.length === 0) continue;

        // Build a transcript of the negotiation
        const transcript = steps
          .map((s) => `Step ${s.stepNumber}:\nInput: ${JSON.stringify(s.input)}\nOutput: ${JSON.stringify(s.output)}`)
          .join('\n\n');

        // Use the LLM to extract key facts
        const extractionPrompt = `
You are an expert procurement analyst. Below is a transcript of a completed negotiation with a vendor.
Extract the key factual outcomes of this negotiation (e.g., agreed discounts, finalized prices, shipping terms, or reasons for failure).
Be concise and factual. Do not include conversational filler.
Format your output as a single clear paragraph.

Transcript:
${transcript}
        `;

        const extractionResult = await this.llmService.chat(
          'You are an expert procurement analyst. Be concise and factual. Do not include conversational filler.',
          extractionPrompt
        );
        
        if (extractionResult && extractionResult.trim()) {
          await this.ragService.ingest(
            `Negotiation Fact for run ${run.id}: ${extractionResult.trim()}`,
            KnowledgeSourceType.NEGOTIATION_TRANSCRIPT,
            {
              vendorId: run.relatedVendorId || undefined,
              tenantId: run.tenantId,
              entityType: 'AgentRun',
              entityId: run.id,
            }
          );
          
          this.logger.log(`Consolidated facts for negotiation run ${run.id}.`);
        }
      } catch (error) {
        this.logger.error(`Failed to consolidate memory for run ${run.id}: ${(error as Error).message}`);
      }
    }

    this.logger.log('Finished nightly memory consolidation process.');
  }
}
