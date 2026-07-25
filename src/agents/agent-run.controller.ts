import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { AgentRunService } from './agent-run.service';

class TestQueueDto {
  @IsIn(['forecasting', 'reorder', 'negotiation', 'anomaly'])
  agentType!: 'forecasting' | 'reorder' | 'negotiation' | 'anomaly';

  @IsOptional()
  @IsUUID('all')
  skuId?: string;
}

@ApiTags('agents')
@Controller('agents')
export class AgentRunController {
  constructor(private readonly agentRunService: AgentRunService) {}

  @Public()
  @Post('test-queue')
  @ApiOperation({ summary: '[TEST] Create an agent run and enqueue it' })
  async testQueue(@Body() body: TestQueueDto) {
    const result = await this.agentRunService.start(body.agentType, {
      skuId: body.skuId,
    });
    const runId = (result as any).data?.id ?? (result as any).id;
    await this.agentRunService.enqueue(runId, body.agentType);
    return { message: 'Agent run created and enqueued', runId };
  }
}
