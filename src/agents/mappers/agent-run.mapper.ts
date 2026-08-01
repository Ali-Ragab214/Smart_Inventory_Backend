import { Injectable } from '@nestjs/common';
import { AgentRun } from '../entities/agent-run.entity';
import { AgentStep } from '../entities/agent-step.entity';
import { AgentRunResponseDto } from '../dto/agent-run-response.dto';
import { AgentStepResponseDto } from '../dto/agent-step-response.dto';
import { AgentRunDetailsResponseDto } from '../dto/agent-run-details-response.dto';

@Injectable()
export class AgentRunMapper {
  toRunResponse(entity: AgentRun): AgentRunResponseDto {
    const dto = new AgentRunResponseDto();
    dto.id = entity.id;
    dto.agentType = entity.agentType;
    dto.status = entity.status;
    dto.skuIds = entity.skus?.map(sku => sku.id) ?? [];
    dto.relatedVendorId = entity.relatedVendorId;
    dto.relatedPoId = entity.relatedPoId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toStepResponse(entity: AgentStep): AgentStepResponseDto {
    const dto = new AgentStepResponseDto();
    dto.id = entity.id;
    dto.agentRunId = entity.agentRunId;
    dto.stepNumber = entity.stepNumber;
    dto.input = entity.input;
    dto.output = entity.output;
    dto.reasoning = entity.reasoning;
    dto.timestamp = entity.timestamp;
    return dto;
  }

  toStepResponseList(entities: AgentStep[]): AgentStepResponseDto[] {
    return entities.map((entity) => this.toStepResponse(entity));
  }

  toRunDetailsResponse(
    run: AgentRun,
    steps: AgentStep[],
  ): AgentRunDetailsResponseDto {
    const dto = new AgentRunDetailsResponseDto();
    dto.run = this.toRunResponse(run);
    dto.steps = this.toStepResponseList(steps);
    return dto;
  }

  toRunResponseList(entities: AgentRun[]): AgentRunResponseDto[] {
    return entities.map((entity) => this.toRunResponse(entity));
  }
}
