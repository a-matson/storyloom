import { readFileSync } from 'node:fs';
import { test, vi } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import type { Adventure, Assertion } from '@core/model';
import * as S from '@core/schema';
import { guessSpeakers } from '@core/text/speakers';
import { createApproxTokenizer, createExactTokenizer } from '@core/text/tokenizer';
import { prepareContext } from '@core/turn';
import { GATE_WINDOW, gateOutput, previousOutputs } from '@core/turn/gate';
import { buildRequest, generate } from '@core/turn/generate';
import type { TurnDeps } from '@core/turn/types';
import { writeMeasurement } from './env';
import { storeAt } from './storeAt';

// M21-3: player actions of a backup with 3+ characters present, each continued once without goals (`main`'s prompt) and once
// with confirmed goals (the quiet rule sends `wants:`), same seed per point. Who the speaker guess labels, the gate's flags,
// and the texts for hand labels. `pnpm measure initiative <url> <backup> [label] [points]`; skipped without the first two.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'm21-3';
const POINTS = Number(process.env['MEASURE_POINTS'] ?? 40);

// Off in the app since this bench measured it; the goals run needs it on.
vi.mock('@core/context/spotlight', async (orig) => ({ ...(await orig<object>()), SEND_GOALS: true }));

/** Goals a player would confirm or write, from the batch read's proposals over the M17 dogfood (labelled by Claude). */
const GOALS: Record<string, string> = {
  Tamsin: "understand her father's work",
  'Brother Aldous': 'stop the deep ones from rising',
  Hedda: 'keep the Drowned Lantern running',
  'Ewan Pike': 'keep the harbour safe',
  Lazarus: 'complete the ritual',
  'Morwenna Hale': 'sever the binding anchors',
};

/** The story as it stood at `i`: the presence and scene logs there, the store before it (as `spotlight.bench.ts`). */
function at(adv: Adventure, i: number, goals: Assertion[]): Adventure {
  const present = adv.plot.presence?.findLast((p) => p.at <= i)?.present ?? [];
  const location = adv.plot.sceneLog?.findLast((p) => p.at <= i)?.location ?? '';
  return {
    ...adv,
    actions: adv.actions.slice(0, i + 1),
    assertions: [...storeAt(adv.assertions, i + 1), ...goals],
    memories: adv.memories.filter((m) => !m.stale && m.toAction <= i),
    plot: { ...adv.plot, scene: { location, present }, presence: adv.plot.presence?.filter((p) => p.at <= i) ?? [] },
  };
}

test.skipIf(!url || !backup)('initiative with and without goals', { timeout: 7_200_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const goals = adv.entities.flatMap((e): Assertion[] => {
    const text = GOALS[e.name];
    return text ? [{ id: `goal-${e.id}`, subject: e.id, producer: 'player', at: 0, basis: 'player', since: 0, kind: 'goal', text }] : [];
  });
  const cast = (i: number) =>
    (adv.plot.presence?.findLast((p) => p.at <= i)?.present ?? []).flatMap((id) => adv.entities.find((e) => e.id === id && e.kind === 'character') ?? []);
  const crowded = adv.actions.flatMap((a, i) => ((a.type === 'do' || a.type === 'say') && cast(i).length >= 3 ? [i] : []));
  const points = crowded.filter((_, k) => k % Math.max(1, Math.floor(crowded.length / POINTS)) === 0).slice(0, POINTS);
  console.log(`${crowded.length} player actions with 3+ present, ${points.length} points, ${goals.length} goals`);
  const provider = new LlamaServerProvider('initiative', url ?? '');
  const deps: TurnDeps = {
    provider,
    tokenizer: createExactTokenizer(createApproxTokenizer(), async (t) => (await provider.tokenize(t)).length),
    contextSize: (await provider.health()).contextSize,
  };
  const rows: { run: 'main' | 'goals'; labelled: string[]; wants: string[]; gate: string | undefined; [k: string]: unknown }[] = [];
  for (const i of points)
    for (const run of ['main', 'goals'] as const) {
      const a = at(adv, i, run === 'goals' ? goals : []);
      const prepared = await prepareContext(a, a.actions, deps);
      if ('stopped' in prepared) throw new Error(prepared.stopped);
      const seed = 3000 + i;
      const gen = generate(a, buildRequest(a, prepared, { seed }), deps);
      let next = await gen.next();
      while (!next.done) next = await gen.next();
      const text = next.value.text;
      const present = cast(i);
      const castText = prepared.result.sections.find((s) => s.kind === 'cast')?.text ?? '';
      const wants = castText.split('\n').flatMap((l) => (l.includes('wants: ') ? [l.split(/[\s(:—]/)[0] ?? ''] : []));
      const gate = gateOutput(text, previousOutputs(a.actions, undefined, GATE_WINDOW), { playerType: a.actions.at(-1)?.type, thirdPerson: false });
      const labelled = [...new Set(guessSpeakers(text, present).map((s) => s.name))];
      rows.push({ run, at: i, seed, present: present.map((e) => e.name), wants, labelled, gate, cast: castText, player: a.actions.at(-1)?.versions[0], text });
      console.log(run, i, `${labelled.length}/${present.length}`, wants.join(','), gate ?? '');
    }
  const score = Object.fromEntries(
    (['main', 'goals'] as const).map((run) => {
      const mine = rows.filter((r) => r.run === run);
      const labelled = mine.reduce((n, r) => n + r.labelled.length, 0);
      return [
        run,
        {
          labelled,
          per10: (labelled / mine.length) * 10,
          wantsSent: mine.reduce((n, r) => n + r.wants.length, 0),
          agency: mine.filter((r) => r.gate === 'agency').length,
        },
      ];
    }),
  );
  console.log(score);
  console.log(`wrote ${writeMeasurement(`initiative-${LABEL}`, { backup, points, goals: GOALS, score, rows })}`);
});
