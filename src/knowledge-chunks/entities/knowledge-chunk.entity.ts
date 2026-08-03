import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';

export enum KnowledgeSourceType {
  VENDOR_CATALOG = 'vendor_catalog',
  PRICE_CHANGE = 'price_change',
  NEGOTIATION = 'negotiation',
}

@Entity('knowledge_chunks')
export class KnowledgeChunk extends AbstractEntity {
  @Column({ type: 'text' })
  content!: string;

  /**
   * pgvector embedding column — managed via raw SQL migration.
   * TypeORM does not natively support the `vector` type, so this
   * column is defined as `text` here for entity sync safety.
   * The actual DDL should use:
   *   ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536);
   */
  @Column({ type: 'text', nullable: true, select: false })
  embedding!: string | null;

  @Column({
    type: 'enum',
    enum: KnowledgeSourceType,
  })
  sourceType!: KnowledgeSourceType;

  @Index('idx_knowledge_chunks_vendor')
  @Column('uuid', { nullable: true })
  vendorId!: string | null;

  @Index('idx_knowledge_chunks_sku')
  @Column('uuid', { nullable: true })
  skuId!: string | null;
}
