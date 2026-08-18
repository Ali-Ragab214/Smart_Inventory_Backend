import { Module, forwardRef } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagIngestionListener } from './rag-ingestion.listener';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [forwardRef(() => AgentsModule)],
  controllers: [RagController],
  providers: [RagService, EmbeddingService, RagIngestionListener],
  exports: [RagService, EmbeddingService],
})
export class RagModule {}
