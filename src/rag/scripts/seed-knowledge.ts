import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { RagService } from '../rag.service';
import { KnowledgeSourceType } from '../entities/knowledge-chunk.entity';

const DOCUMENTS: Array<{ content: string; sourceType: KnowledgeSourceType }> = [
  // Vendor contract summaries
  {
    sourceType: KnowledgeSourceType.CONTRACT,
    content:
      'VendorCo agrees to supply Product X at $9.00/unit with a 7-day lead time. Minimum order quantity is 500 units. Payment terms are net 30 days. Volume discount of 5% applies above 5,000 units per quarter.',
  },
  {
    sourceType: KnowledgeSourceType.CONTRACT,
    content:
      'TechCorp Suppliers contract: wireless peripherals at $12.50/unit, 3-day lead time, no minimum order. Freight is included for orders above $2,000. Contract term is 12 months, auto-renewing.',
  },
  {
    sourceType: KnowledgeSourceType.CONTRACT,
    content:
      'WoodWorks Inc frame supply agreement: office desk frames at $45.00/unit, 14-day lead time, minimum order 100 units. 10% restocking fee applies on cancelled orders after production starts.',
  },
  {
    sourceType: KnowledgeSourceType.CONTRACT,
    content:
      'SteelSource metals contract: raw steel sheets at $0.85/lb, 21-day lead time, minimum order 10 tons. Price is fixed for 6 months; quarterly review allows renegotiation if market moves beyond 8%.',
  },

  // Past negotiation summaries
  {
    sourceType: KnowledgeSourceType.NEGOTIATION_TRANSCRIPT,
    content:
      'Negotiation with VendorCo on 2025-01-15: opened at $9.50/unit, agreed at $9.00/unit after 2 rounds. Concessions: committed to 500-unit minimum, gained free freight on first order.',
  },
  {
    sourceType: KnowledgeSourceType.NEGOTIATION_TRANSCRIPT,
    content:
      'Negotiation with TechCorp on 2025-03-02: opened at $14.00/unit, closed at $12.50/unit with 3-day lead time. Vendor offered the price cut in exchange for a 12-month exclusivity window.',
  },
  {
    sourceType: KnowledgeSourceType.NEGOTIATION_TRANSCRIPT,
    content:
      'Negotiation with WoodWorks on 2024-11-20: quote was $52.00/unit, final $45.00/unit after 3 rounds. Key lever: committed annual volume of 1,200 frames. Payment moved to net 45 days.',
  },

  // Product catalog entries
  {
    sourceType: KnowledgeSourceType.CATALOG,
    content:
      'Product X: industrial-grade component, 100 units per carton, weight 0.4 kg each. Compatible with Model A and Model B assemblies. Certifications: ISO 9001, RoHS compliant.',
  },
  {
    sourceType: KnowledgeSourceType.CATALOG,
    content:
      'ThinkPad T14: business laptop, 14-inch display, 16GB RAM, 512GB SSD. Recommended retail price $1,200. Bulk pricing available from 50 units. Two-year onsite warranty.',
  },
];

async function bootstrap() {
  console.log('Starting knowledge seed script...');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get(DataSource);
    console.log('Clearing existing knowledge chunks...');
    await dataSource.query('DELETE FROM knowledge_chunks');

    const ragService = app.get(RagService);
    console.log(`Ingesting ${DOCUMENTS.length} sample documents...`);

    for (const doc of DOCUMENTS) {
      const result = await ragService.ingest(doc.content, doc.sourceType);
      console.log(`  [${result.sourceType}] ${result.id}`);
    }

    const { count } = (
      await dataSource.query('SELECT COUNT(*)::int AS count FROM knowledge_chunks')
    )[0];
    console.log(`Seeding completed! ${count} rows in knowledge_chunks.`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('[ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
