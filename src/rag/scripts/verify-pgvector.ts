import 'dotenv/config';
import { Pool } from 'pg';

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
  fix?: string;
}

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5424', 10),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'stocksavvy_pass',
  database: process.env.DB_NAME ?? 'smart_inventory',
});

async function run(): Promise<number> {
  const results: CheckResult[] = [];
  const client = await pool.connect();

  try {
    const ext = await client.query(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    const extPass = ext.rowCount === 1;
    results.push({
      name: 'pgvector extension',
      pass: extPass,
      detail: extPass
        ? `vector ${ext.rows[0].extversion}`
        : 'extension not found',
      fix: extPass ? undefined : 'CREATE EXTENSION IF NOT EXISTS vector;',
    });

    const col = await client.query(
      `SELECT data_type, udt_name
       FROM information_schema.columns
       WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'`,
    );
    const colPass = col.rowCount === 1 && col.rows[0].udt_name === 'vector';
    results.push({
      name: 'knowledge_chunks.embedding column (vector(1536))',
      pass: colPass,
      detail:
        col.rowCount === 1
          ? `udt_name=${col.rows[0].udt_name} data_type=${col.rows[0].data_type}`
          : 'column not found',
      fix: colPass
        ? undefined
        : col.rowCount === 1
          ? 'ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector;'
          : 'ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536);',
    });

    const idx = await client.query(
      `SELECT indexdef
       FROM pg_indexes
       WHERE tablename = 'knowledge_chunks' AND indexname = 'knowledge_chunks_embedding_idx'`,
    );
    const idxPass = idx.rowCount === 1;
    results.push({
      name: 'knowledge_chunks_embedding_idx index',
      pass: idxPass,
      detail: idxPass ? idx.rows[0].indexdef : 'index not found',
      fix: idxPass
        ? undefined
        : 'CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);',
    });
  } finally {
    client.release();
  }

  let allPass = true;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`);
    if (r.detail) {
      console.log(`       ${r.detail}`);
    }
    if (!r.pass && r.fix) {
      console.log(`       fix: ${r.fix}`);
      allPass = false;
    } else if (!r.pass) {
      allPass = false;
    }
  }

  console.log(
    allPass
      ? 'All pgvector checks passed.'
      : 'Some checks failed. Apply the fix commands and re-run.',
  );
  return allPass ? 0 : 1;
}

run()
  .then((code) => {
    void pool.end();
    process.exit(code);
  })
  .catch((err) => {
    console.error(
      `[ERROR] ${err instanceof Error ? err.message : String(err)}`,
    );
    void pool.end();
    process.exit(1);
  });
