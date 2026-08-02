import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  controllers: [RagController],
  providers: [RagService, EmbeddingService],
  exports: [RagService, EmbeddingService],
})
export class RagModule {}
