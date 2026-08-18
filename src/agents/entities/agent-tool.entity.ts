import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../../shared/base.entity';

/**
 * The `embedding` column is NOT declared here because TypeORM has no
 * native pgvector type. It is added via raw SQL in a setup script:
 *   ALTER TABLE agent_tools ADD COLUMN embedding vector(384);
 * All vector operations (insert, similarity search) are handled via raw SQL.
 */
@Entity('agent_tools')
export class AgentTool extends AbstractEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  // Store the JSON schema for the tool parameters
  @Column({ type: 'jsonb', nullable: true })
  parametersSchema!: any;
}
