import { Injectable } from '@nestjs/common';
import { AnomalyFlag } from '../entities/anomaly-flag.entity';
import { AnomalyFlagResponseDto } from '../dto/anomaly-flag-response.dto';

@Injectable()
export class AnomalyFlagMapper {
  toResponse(entity: AnomalyFlag): AnomalyFlagResponseDto {
    const dto = new AnomalyFlagResponseDto();
    dto.id = entity.id;
    dto.agentRunId = entity.agentRunId;
    dto.skuId = entity.skuId;
    dto.description = entity.description;
    dto.relatedMovementIds = entity.relatedMovementIds;
    dto.status = entity.status;
    dto.reviewedBy = entity.reviewedBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  toResponseList(entities: AnomalyFlag[]): AnomalyFlagResponseDto[] {
    return entities.map((entity) => this.toResponse(entity));
  }
}
