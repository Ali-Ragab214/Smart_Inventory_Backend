import { Column, Entity } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';

export enum KnowledgeSourceType {
  CONTRACT = 'contract',
  CATALOG = 'catalog',
  NEGOTIATION_TRANSCRIPT = 'negotiation_transcript',
  REPORT = 'report',
}

/**
 * The `embedding` column is NOT declared here because TypeORM has no
 * native pgvector type. It is added via raw SQL in a setup script:
 *   ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(384);
 * All vector operations (insert, similarity search) are handled via raw SQL
 * through DataSource.query() in RagService.
 */
@Entity('knowledge_chunks')
export class KnowledgeChunk extends AbstractEntity {
  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'enum',
    enum: KnowledgeSourceType,
  })
  sourceType!: KnowledgeSourceType;

  @Column('uuid', { nullable: true })
  vendorId!: string | null;

  @Column('uuid', { nullable: true })
  skuId!: string | null;
}
