import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { memoryText } from '@core/memory/memoryJobs';
import { youLines } from '@core/memory/you';
import * as S from '@core/schema';
import { contentClause } from '@core/text/content';
import { writeMeasurement } from './env';

// The memory for one action range of a backup, written N times; graded by hand (subject swaps, invented looks).
// `pnpm measure memory-replay <url> <backup.storyloom.json> <from-to> [label] [samples]`; skipped without the first three.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const [from, to] = (process.env['MEASURE_RANGE'] ?? '').split('-').map(Number);
const LABEL = process.env['MEASURE_LABEL'] ?? 'before';
const SAMPLES = Number(process.env['MEASURE_SAMPLES'] ?? 5);

test.skipIf(!url || !backup || !Number.isInteger(from) || !Number.isInteger(to))('memory replay over a backup', { timeout: 900_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const provider = new LlamaServerProvider('memory-replay', url ?? '');
  // As the app's helper deps (`helperModel.ts`), content clause included.
  const deps = { provider, template: adv.settings.template, content: contentClause(adv.settings, 'record') };
  const slice = adv.actions.slice(from, to);
  const samples: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    // A twice-rejected reply is a skipped range in the app.
    samples.push((await memoryText(slice, deps, { memoriesRejected: 0 }, youLines(adv.assertions))) ?? '<skipped>');
    console.log(`--- sample ${i + 1}\n${samples[i]}`);
  }
  console.log(`wrote ${writeMeasurement(`memory-replay-${from}-${to}-${LABEL}`, { backup, from, to, samples })}`);
});
