import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import type { Adventure, Assertion } from '@core/model';
import * as S from '@core/schema';
import { paragraphs } from '@core/text/formatting';
import { guessSpeakers } from '@core/text/speakers';
import { createApproxTokenizer, createExactTokenizer } from '@core/text/tokenizer';
import { prepareContext } from '@core/turn';
import { buildRequest, generate } from '@core/turn/generate';
import type { TurnDeps } from '@core/turn/types';
import { writeMeasurement } from './env';

// M20-4: each `say` turn of a backup where a top speaker is present, replayed without and with the voices a batch
// run read (same seed per arm); each top speaker's quoted lines, to rate by hand (same register and address form).
// `pnpm measure voice <url> <backup> <batch-….json> [label] [samples]`; skipped without the first three.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const batch = process.env['MEASURE_VOICES'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'm20-4';
const SAMPLES = Number(process.env['MEASURE_SAMPLES'] ?? 1);
/** Characters rated, the most labelled first. */
const TOP = 3;

/** The scene as it stood at `at`: who the presence log had there, where the scene log had them. */
function at(adv: Adventure, i: number): Adventure {
  const present = adv.plot.presence?.findLast((p) => p.at <= i)?.present ?? [];
  const location = adv.plot.sceneLog?.findLast((p) => p.at <= i)?.location ?? '';
  return {
    ...adv,
    actions: adv.actions.slice(0, i + 1),
    memories: adv.memories.filter((m) => !m.stale && m.toAction <= i),
    plot: { ...adv.plot, scene: { location, present }, presence: adv.plot.presence?.filter((p) => p.at <= i) ?? [] },
  };
}

test.skipIf(!url || !backup || !batch)('voices on say turns', { timeout: 3_600_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const read = JSON.parse(readFileSync(batch ?? '', 'utf8')) as { replies: { voices: { name: string; text: string }[] }[] };
  const counts = new Map<string, number>();
  for (const s of adv.actions.flatMap((a) => a.speakers ?? [])) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const top = [...counts]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([n]) => adv.entities.find((e) => e.name === n)!);
  // The newest voice each read, as the store would hold it.
  const voiceOf = new Map(read.replies.flatMap((r) => r.voices).map((v) => [v.name, v.text]));
  const voices: Assertion[] = top.flatMap((e) => {
    const text = voiceOf.get(e.name);
    return text ? [{ id: `voice-${e.id}`, subject: e.id, producer: 'batch', at: 0, basis: 'stated', since: 0, kind: 'voice', text }] : [];
  });
  const provider = new LlamaServerProvider('voice', url ?? '');
  const deps: TurnDeps = {
    provider,
    tokenizer: createExactTokenizer(createApproxTokenizer(), async (t) => (await provider.tokenize(t)).length),
    contextSize: (await provider.health()).contextSize,
  };
  const turns = adv.actions.flatMap((a, i) => (a.type === 'say' && at(adv, i).plot.scene?.present.some((p) => top.some((e) => e.id === p)) ? [i] : []));
  const lines: { arm: string; at: number; seed: number; name: string; line: string }[] = [];
  const cast: Record<string, string> = {};
  for (const i of turns)
    for (let k = 0; k < SAMPLES; k++)
      for (const [arm, extra] of [
        ['before', []],
        ['after', voices],
      ] as const) {
        const a = { ...at(adv, i), assertions: [...adv.assertions, ...extra] };
        const prepared = await prepareContext(a, a.actions, deps);
        if ('stopped' in prepared) throw new Error(prepared.stopped);
        if (arm === 'after') cast[`${i}`] = prepared.result.sections.find((s) => s.kind === 'cast')?.text ?? '';
        const seed = 1000 + i * 10 + k;
        const gen = generate(a, buildRequest(a, prepared, { seed }), deps);
        let next = await gen.next();
        while (!next.done) next = await gen.next();
        const text = next.value.text;
        const ps = paragraphs(text);
        for (const s of guessSpeakers(text, top))
          for (const q of ps[s.paragraph]?.match(/"[^"]*"|“[^”]*”/g) ?? []) lines.push({ arm, at: i, seed, name: s.name, line: q });
        console.log(arm, i, lines.filter((l) => l.arm === arm).length);
      }
  console.log(
    `wrote ${writeMeasurement(`voice-${LABEL}`, { backup, batch, top: top.map((e) => e.name), voices: Object.fromEntries(voiceOf), turns, cast, lines })}`,
  );
});
