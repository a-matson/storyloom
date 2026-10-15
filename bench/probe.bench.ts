import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import * as S from '@core/schema';
import { createApproxTokenizer, createExactTokenizer } from '@core/text/tokenizer';
import { prepareContext } from '@core/turn';
import { buildRequest, generate, randomSeed } from '@core/turn/generate';
import type { TurnDeps } from '@core/turn/types';
import { writeMeasurement } from './env';

// The reply to one player action of a backup, drawn N times; graded by hand (does an absent character say the secret?).
// `pnpm measure probe <url> <backup.storyloom.json> <at> [label] [samples]`; skipped without the first three.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const AT = Number(process.env['MEASURE_AT']);
const LABEL = process.env['MEASURE_LABEL'] ?? 'before';
const SAMPLES = Number(process.env['MEASURE_SAMPLES'] ?? 3);

test.skipIf(!url || !backup || !Number.isInteger(AT))('secret probe over a backup', { timeout: 1_800_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  adv.actions = adv.actions.slice(0, AT + 1);
  // As the app stood when action AT was sent; memories are not cut at `toAction`, so the one over the secret stays.
  if (adv.plot.presence) adv.plot.presence = adv.plot.presence.filter((p) => p.at < AT);
  adv.memories = adv.memories.filter((m) => !m.stale && m.fromAction < AT);
  const provider = new LlamaServerProvider('probe', url ?? '');
  const approx = createApproxTokenizer();
  const deps: TurnDeps = {
    provider,
    tokenizer: createExactTokenizer(approx, async (t) => (await provider.tokenize(t)).length),
    contextSize: (await provider.health()).contextSize,
  };
  const prepared = await prepareContext(adv, adv.actions, deps);
  if ('stopped' in prepared) throw new Error(prepared.stopped);
  const cast = prepared.result.sections.find((s) => s.kind === 'cast')?.text ?? '';
  const samples: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const gen = generate(adv, buildRequest(adv, prepared, { seed: randomSeed() }), deps);
    let next = await gen.next();
    while (!next.done) next = await gen.next();
    samples.push(next.value.text);
    console.log(`--- sample ${i + 1}\n${next.value.text}`);
  }
  console.log(`--- cast\n${cast}`);
  const path = writeMeasurement(`probe-${LABEL}`, { backup, at: AT, samples, cast, prompt: prepared.prompt });
  console.log(`wrote ${path}`);
});
