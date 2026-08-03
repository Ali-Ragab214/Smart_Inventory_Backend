import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { AgentRunService } from './agent-run.service';
import { ToolExecutorService } from './tool-executor.service';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';

class TestQueueDto {
  @IsIn(['forecasting', 'reorder', 'negotiation', 'anomaly'])
  agentType!: 'forecasting' | 'reorder' | 'negotiation' | 'anomaly';

  @IsOptional()
  @IsUUID('all', { each: true })
  skuIds?: string[];
}

class TestToolDto {
  @IsString()
  toolName!: string;

  @IsOptional()
  input?: Record<string, unknown>;
}

@ApiTags('agents')
@Controller('agents')
export class AgentRunController {
  constructor(
    private readonly agentRunService: AgentRunService,
    private readonly toolExecutor: ToolExecutorService,
  ) {}

  @Public()
  @Post('test-queue')
  @ApiOperation({ summary: '[TEST] Create an agent run and enqueue it' })
  async testQueue(@Body() body: TestQueueDto, @CurrentUser() user: UserResponseDto) {
    const result = await this.agentRunService.start(user.tenantId!, body.agentType, {
      skuIds: body.skuIds,
    });
    const runId = (result as any).data?.id ?? (result as any).id;
    await this.agentRunService.enqueue(runId, body.agentType);
    return { message: 'Agent run created and enqueued', runId };
  }

  @Public()
  @Post('test-tool')
  @ApiOperation({ summary: '[TEST] Execute a tool and return its result' })
  async testTool(@Body() body: TestToolDto, @CurrentUser() user: UserResponseDto) {
    const result = await this.toolExecutor.execute(user.tenantId!, body.toolName, body.input ?? {});
    return { success: true, data: result };
  }
}
