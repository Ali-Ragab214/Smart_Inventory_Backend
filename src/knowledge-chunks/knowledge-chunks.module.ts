import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunk])],
})
export class KnowledgeChunksModule {}
