import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { z } from 'zod/mini';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { checkOutput } from '@core/memory/contradiction';
import { writeMeasurement } from './env';

// Precision of the contradiction check: `pnpm measure contradiction <url> [label] [cases]`; skipped without a url.
// Each case file (comma-separated; default the recall-bench probe outputs) is scored on its own.
// `contradicts` is the hand label: the line the output breaks, or null.
const url = process.env['MEASURE_URL'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'run';
const FILES = (process.env['MEASURE_CASES'] ?? 'bench/contradiction-cases.json').split(',');
// `locked`: what the check sees with the setting off, Scene: lines dropped and cases left empty skipped.
const LOCKED = process.env['MEASURE_SCOPE'] === 'locked';

const Cases = z.array(z.object({ probe: z.string(), output: z.string(), lines: z.array(z.string()), contradicts: z.nullable(z.string()) }));

test.skipIf(!url)('contradiction check precision on hand-labelled outputs', { timeout: 1_800_000 }, async () => {
  const provider = new LlamaServerProvider('check', url ?? '');
  const files = [];
  for (const file of FILES) {
    const rows = [];
    for (const all of Cases.parse(JSON.parse(readFileSync(file, 'utf8')))) {
      const c = LOCKED ? { ...all, lines: all.lines.filter((l) => !l.startsWith('Scene:')) } : all;
      if (!c.lines.length) continue;
      const started = performance.now();
      const flagged = await checkOutput(c.output, c.lines, { provider, template: 'chatml' });
      rows.push({ probe: c.probe, label: c.contradicts !== null, flagged, right: flagged === c.contradicts, ms: Math.round(performance.now() - started) });
    }
    const tp = rows.filter((r) => r.label && r.right).length;
    const predicted = rows.filter((r) => r.flagged !== null).length;
    const positives = rows.filter((r) => r.label).length;
    const ms = rows.map((r) => r.ms).toSorted((x, y) => x - y);
    const summary = {
      precision: predicted ? tp / predicted : null,
      recall: positives ? tp / positives : null,
      tp,
      predicted,
      positives,
      cases: rows.length,
      medianMs: ms[Math.floor(ms.length / 2)],
    };
    console.table(rows);
    console.log(file, summary);
    files.push({ file, summary, rows });
  }
  console.log(writeMeasurement(`contradiction-${LABEL}`, { files }));
});
