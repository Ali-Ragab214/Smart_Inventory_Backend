import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../utils/response.util';
import { RagService } from './rag.service';
import { IngestKnowledgeChunkDto } from './schemas/knowledge-chunk.schema';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest a document chunk into the knowledge base' })
  @ApiCreatedResponse({ description: 'Chunk ingested successfully' })
  @ApiBadRequestResponse({ description: 'Empty content or invalid sourceType' })
  async ingest(@Body() dto: IngestKnowledgeChunkDto) {
    const data = await this.ragService.ingest(dto.content, dto.sourceType, {
      vendorId: dto.vendorId,
      skuId: dto.skuId,
    });
    return successResponse(data);
  }
}
