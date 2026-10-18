import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { presentAt, secretsOf } from '@core/memory/secrets';
import * as S from '@core/schema';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { prepareContext } from '@core/turn';
import { writeMeasurement } from './env';
import { withSecret } from './secret';

// Secret cuts in the prompt before every AI output of a backup, no model: how many, and what was cut.
// `pnpm measure redact <backup> [label]`, with `MEASURE_SECRET` as for the probe. Each prompt's cast is the scene
// as `plot.presence` had it then; the final scene line would put the last cast in every prompt.
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';

test.skipIf(!backup)('secret cuts over a backup', { timeout: 600_000 }, async () => {
  const adv = withSecret(S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure));
  const from = Math.min(...secretsOf(adv.assertions).map((s) => s.at));
  // Never called: no scripts, and the approximate tokenizer needs no server.
  const deps = { provider: new LlamaServerProvider('redact', 'http://127.0.0.1:1'), tokenizer: createApproxTokenizer(), contextSize: 8192 };
  const turns = [];
  for (let at = from + 1; at < adv.actions.length; at++) {
    if (adv.actions[at]?.type !== 'continue') continue;
    const presence = adv.plot.presence?.filter((p) => p.at < at);
    const scene = { ...adv.plot.scene, present: presentAt(presence, at) };
    const then = { ...adv, plot: { ...adv.plot, presence, scene }, memories: adv.memories.filter((m) => !m.stale && m.toAction <= at) };
    const prepared = await prepareContext(then, adv.actions.slice(0, at), deps);
    if ('stopped' in prepared) throw new Error(prepared.stopped);
    turns.push({ at, cuts: prepared.result.redactions });
  }
  const cut = turns.filter((t) => t.cuts.length);
  console.log(`${cut.length}/${turns.length} prompts cut, ${turns.length - cut.length} with only knowers in the cast`);
  console.log(writeMeasurement(`redact-${LABEL}`, { backup, secret: process.env['MEASURE_SECRET'], turns }));
});
