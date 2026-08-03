import 'dotenv/config';
import { EmbeddingService } from '../embedding.service';

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

async function run(): Promise<number> {
  const service = new EmbeddingService();
  const results: CheckResult[] = [];

  try {
    const v = await service.embed(
      'What is the price of product X from vendor Y?',
    );
    const inRange = v.length === 384 && v.every((n) => n >= -1 && n <= 1);
    results.push({
      name: 'embed(long query) returns 384 dims in [-1, 1]',
      pass: inRange,
      detail: `got ${v.length} dims`,
    });
  } catch (err) {
    results.push({
      name: 'embed(long query)',
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  for (const input of ['hello', 'hello world']) {
    try {
      const v = await service.embed(input);
      results.push({
        name: `embed('${input}') returns 384 dims`,
        pass: v.length === 384,
        detail: `got ${v.length} dims`,
      });
    } catch (err) {
      results.push({
        name: `embed('${input}')`,
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let emptyThrew = false;
  let emptyErr = '';
  try {
    await service.embed('');
  } catch (err) {
    emptyThrew = true;
    emptyErr = err instanceof Error ? err.message : String(err);
  }
  results.push({
    name: "embed('') throws a clear error",
    pass: emptyThrew,
    detail: emptyThrew ? emptyErr : 'did not throw',
  });

  let allPass = true;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`);
    if (r.detail) {
      console.log(`       ${r.detail}`);
    }
    if (!r.pass) {
      allPass = false;
    }
  }

  console.log(
    allPass
      ? 'All embedding checks passed.'
      : 'Some checks failed. See details above.',
  );
  return allPass ? 0 : 1;
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `[ERROR] ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
