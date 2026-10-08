import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { z } from 'zod/mini';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { checkOutput } from '@core/memory/contradiction';
import { writeMeasurement } from './env';

// Precision of the contradiction check: `pnpm measure contradiction <url> [label]`; skipped without a url.
// Cases are recall-bench probe outputs; `contradicts` is the hand label (the line it breaks, or null).
const url = process.env['MEASURE_URL'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'run';

const Cases = z.array(z.object({ probe: z.string(), output: z.string(), lines: z.array(z.string()), contradicts: z.nullable(z.string()) }));

test.skipIf(!url)('contradiction check precision on hand-labelled outputs', { timeout: 900_000 }, async () => {
  const cases = Cases.parse(JSON.parse(readFileSync('bench/contradiction-cases.json', 'utf8')));
  const provider = new LlamaServerProvider('check', url ?? '');
  const rows = [];
  for (const c of cases) {
    const started = performance.now();
    const flagged = await checkOutput(c.output, c.lines, { provider, template: 'chatml' });
    rows.push({ probe: c.probe, label: c.contradicts !== null, flagged, right: flagged === c.contradicts, ms: Math.round(performance.now() - started) });
  }
  const tp = rows.filter((r) => r.label && r.right).length;
  const predicted = rows.filter((r) => r.flagged !== null).length;
  const positives = rows.filter((r) => r.label).length;
  const summary = { precision: predicted ? tp / predicted : null, recall: tp / positives, tp, predicted, positives, cases: rows.length };
  console.table(rows);
  console.log(summary);
  writeMeasurement(`contradiction-${LABEL}`, { summary, rows });
});
