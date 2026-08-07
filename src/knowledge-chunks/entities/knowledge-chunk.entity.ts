import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';

export enum KnowledgeSourceType {
  CONTRACT = 'contract',
  CATALOG = 'catalog',
  NEGOTIATION_TRANSCRIPT = 'negotiation_transcript',
  REPORT = 'report',
}

@Entity('knowledge_chunks')
export class KnowledgeChunk extends AbstractEntity {
  @Column({ type: 'text' })
  content!: string;

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

  @Index('idx_knowledge_chunks_tenant_kc')
  @Column('uuid', { nullable: true })
  tenantId!: string | null;

  @Index('idx_knowledge_chunks_entity_type_kc')
  @Column({ type: 'varchar', length: 50, nullable: true })
  entityType!: string | null;

  @Column('uuid', { nullable: true })
  entityId!: string | null;
}
