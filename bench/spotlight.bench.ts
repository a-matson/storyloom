import { readFileSync } from 'node:fs';
import { test, vi } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import type * as Spotlight from '@core/context/spotlight';
import type { SpotlightOrder } from '@core/context/spotlight';
import type { Adventure } from '@core/model';
import * as S from '@core/schema';
import { guessSpeakers } from '@core/text/speakers';
import { createApproxTokenizer, createExactTokenizer } from '@core/text/tokenizer';
import { prepareContext } from '@core/turn';
import { buildRequest, generate } from '@core/turn/generate';
import type { TurnDeps } from '@core/turn/types';
import { writeMeasurement } from './env';
import { storeAt } from './storeAt';

// M21-6: player actions of a backup with 4–5 characters present, each continued once per cast order (same seed per
// point); which present characters the speaker guess labels in the reply. Only speaker labels: the bench has no state read.
// `pnpm measure spotlight <url> <backup> [label] [points]`; skipped without the first two.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'm21-6';
const POINTS = Number(process.env['MEASURE_POINTS'] ?? 20);
const ORDERS: SpotlightOrder[] = ['fixed', 'quietFirst', 'quietLast'];

const order = vi.hoisted(() => ({ v: 'fixed' as SpotlightOrder }));
vi.mock('@core/context/spotlight', async (orig) => {
  const m = await orig<typeof Spotlight>();
  return { ...m, spotlight: (...[here, actions, ix]: Parameters<typeof m.spotlight>) => m.spotlight(here, actions, ix, order.v) };
});

/** The story as it stood at `i`: the presence and scene logs there, the store before it. */
function at(adv: Adventure, i: number): Adventure {
  const present = adv.plot.presence?.findLast((p) => p.at <= i)?.present ?? [];
  const location = adv.plot.sceneLog?.findLast((p) => p.at <= i)?.location ?? '';
  return {
    ...adv,
    actions: adv.actions.slice(0, i + 1),
    assertions: storeAt(adv.assertions, i + 1),
    memories: adv.memories.filter((m) => !m.stale && m.toAction <= i),
    plot: { ...adv.plot, scene: { location, present }, presence: adv.plot.presence?.filter((p) => p.at <= i) ?? [] },
  };
}

test.skipIf(!url || !backup)('spotlight order on crowded scenes', { timeout: 3_600_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const cast = (i: number) =>
    (adv.plot.presence?.findLast((p) => p.at <= i)?.present ?? []).flatMap((id) => adv.entities.find((e) => e.id === id && e.kind === 'character') ?? []);
  const crowded = adv.actions.flatMap((a, i) => (a.type !== 'continue' && a.type !== 'start' && cast(i).length >= 4 && cast(i).length <= 5 ? [i] : []));
  // Spread over the story, not the first crowded stretch.
  const points = crowded.filter((_, k) => k % Math.max(1, Math.floor(crowded.length / POINTS)) === 0).slice(0, POINTS);
  console.log(`${crowded.length} crowded player actions, ${points.length} points`);
  const provider = new LlamaServerProvider('spotlight', url ?? '');
  const deps: TurnDeps = {
    provider,
    tokenizer: createExactTokenizer(createApproxTokenizer(), async (t) => (await provider.tokenize(t)).length),
    contextSize: (await provider.health()).contextSize,
  };
  const rows: { order: SpotlightOrder; at: number; seed: number; present: string[]; labelled: string[]; cast: string }[] = [];
  for (const i of points)
    for (const o of ORDERS) {
      order.v = o;
      const a = at(adv, i);
      const prepared = await prepareContext(a, a.actions, deps);
      if ('stopped' in prepared) throw new Error(prepared.stopped);
      const seed = 2000 + i;
      const gen = generate(a, buildRequest(a, prepared, { seed }), deps);
      let next = await gen.next();
      while (!next.done) next = await gen.next();
      const present = cast(i);
      const labelled = [...new Set(guessSpeakers(next.value.text, present).map((s) => s.name))];
      const castText = prepared.result.sections.find((s) => s.kind === 'cast')?.text ?? '';
      rows.push({ order: o, at: i, seed, present: present.map((e) => e.name), labelled, cast: castText });
      console.log(o, i, `${labelled.length}/${present.length}`);
    }
  const shares = Object.fromEntries(
    ORDERS.map((o) => {
      const mine = rows.filter((r) => r.order === o);
      const labelled = mine.reduce((n, r) => n + r.labelled.length, 0);
      const present = mine.reduce((n, r) => n + r.present.length, 0);
      return [o, { labelled, present, share: labelled / present, per10: (labelled / mine.length) * 10 }];
    }),
  );
  console.log(shares);
  console.log(`wrote ${writeMeasurement(`spotlight-${LABEL}`, { backup, points, shares, rows })}`);
});
