import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { z } from 'zod/mini';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { knownAs, matchEntity, mergeEntity } from '@core/memory/entities';
import { HELPER_JSON_SAMPLING, passageOf } from '@core/memory/extract';
import { nextScene } from '@core/memory/scene';
import type { Entity, Scene } from '@core/model/types';
import { collect } from '@core/ports/provider';
import * as S from '@core/schema';
import { turnRead } from '@core/schema/extraction';
import { EXTRACT_SYSTEM } from '@core/text/prompts';
import { introducePrompt } from '@core/text/turnReadPrompt';
import { renderTemplate } from '@core/text/templates';
import { writeMeasurement } from './env';
import { pickSet, scoreRows, type StateRow } from './stateScore';

// Reads A (scene) and B (state of who is there) replayed over every AI turn of a backup, scored against hand labels.
// `pnpm measure state <url> <backup.storyloom.json> [label] [labels-set]`; skipped without both.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';
const SET = process.env['MEASURE_LABELS'] ?? 'm12-dogfood';

const grammar = (s: z.ZodMiniType) => {
  const { $schema: _d, ...schema } = z.toJSONSchema(s);
  return schema;
};
const enumOf = (list: readonly string[]) => z.enum(list.length ? (list as [string, ...string[]]) : ['nobody']);
interface Reply {
  ms: number;
  tokens?: number | undefined;
  stop?: string | undefined;
  raw: string;
}
const Key = z.enum(['location', 'condition', 'posture', 'mood', 'wearing', 'holds']);
/** Read B: a value padded to a longer cap ran its reply to the token cap (P8b). */
const NOW_CHARS = 20;
const B_TOKENS_EACH = 50;
const B_TOKENS_CAP = 160;

test.skipIf(!url || !backup)('state reads over a backup', { timeout: 3_600_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const set = pickSet(JSON.parse(readFileSync('bench/stateLabels.json', 'utf8')), SET);
  const provider = new LlamaServerProvider('state', url ?? '');
  const ask = async <T>(user: string, schema: z.ZodMiniType<T>, maxTokens: number) => {
    const r = renderTemplate(adv.settings.template, EXTRACT_SYSTEM, user, '');
    const t0 = Date.now();
    const { text, stats } = await collect(
      provider.complete({
        prompt: r.prompt,
        maxTokens,
        temperature: 0.2,
        topP: 0.9,
        ...HELPER_JSON_SAMPLING,
        stop: r.stop,
        cachePrompt: false,
        slotId: 1,
        jsonSchema: grammar(schema),
      }),
    );
    let parsed: T | undefined;
    try {
      parsed = schema.parse(JSON.parse(text));
    } catch {
      parsed = undefined;
    }
    return { text, parsed, ms: Date.now() - t0, tokens: stats?.generatedTokens, stop: stats?.stopReason };
  };

  const rows: (StateRow & { a: Reply; b?: Reply })[] = [];
  let scene: Scene = { location: set.start, present: [] };
  const places: Entity[] = [];
  let moves = 0;
  const newPlaces: string[] = [];
  const record: Record<string, Record<string, string>> = {};
  for (let i = 2; i < adv.actions.length; i++) {
    if (adv.actions[i]?.type !== 'continue') continue;
    const n = i + 1;
    const characters = adv.entities.filter((e) => e.kind === 'character' && e.firstSeen <= i);
    const cast = [...new Set(characters.flatMap((e) => [e.name, ...e.aliases]))];
    const passage = passageOf({ ...adv, actions: adv.actions.slice(0, n) }, { fromAction: Math.max(0, n - 2), toAction: n });

    // Read A: the turn read from core, its scene part only (as on a turn with no new name).
    const a = await ask(introducePrompt(passage, [], true, scene, cast), turnRead(cast, false), 80);
    const read = a.parsed?.scene;
    if (read) {
      // As `introduce` does: an unknown location becomes a place card.
      if (read.location.trim() && !knownAs(places, read.location)) {
        places.push(mergeEntity(undefined, { name: read.location.trim(), kind: 'place', description: '' }, i));
        newPlaces.push(read.location.trim());
      }
      const r = nextScene(scene, read, (s) => matchEntity(characters, s)?.name, i, places);
      if (r.moved) moves++;
      scene = r.scene ?? scene;
    }

    // Read B: the P8b shape for whoever read A left in the scene, against B's own record so far.
    const here = scene.present;
    const b = here.length
      ? await ask(
          `Characters in the scene, with their record before this passage:\n${here
            .map(
              (w) =>
                `${w}: ${
                  Object.entries(record[w] ?? {})
                    .map(([k, v]) => `${k} ${v}`)
                    .join('; ') || 'nothing yet'
                }`,
            )
            .join('\n')}\n\n---\n${passage}\n---\n\n` +
            `What changed for these characters by the end of the passage? At most ${2 * here.length} entries, the most important first: the character, which key, the new value in at most four words, and at = the [number] of the paragraph that shows it. ` +
            'Skip values that did not change. Only what the passage states. Write the JSON on one line with no spaces after the commas.',
          z.object({
            changes: z
              .array(z.object({ who: enumOf(here), key: Key, now: z.string().check(z.maxLength(NOW_CHARS)), at: z.number() }))
              .check(z.maxLength(2 * here.length)),
          }),
          Math.min(B_TOKENS_EACH * here.length, B_TOKENS_CAP),
        )
      : undefined;
    // A later `at` for the same key wins.
    for (const c of (b?.parsed?.changes ?? []).toSorted((x, y) => x.at - y.at)) record[c.who] = { ...record[c.who], [c.key]: c.now };

    rows.push({
      i,
      cast,
      location: scene.location,
      present: scene.present,
      record: structuredClone(record),
      a: { ms: a.ms, tokens: a.tokens, stop: a.stop, raw: a.text },
      ...(b && { b: { ms: b.ms, tokens: b.tokens, stop: b.stop, raw: b.text } }),
    });
    console.log('state', i, `A ${a.ms} ms ${a.stop}`, b ? `B ${b.ms} ms ${b.stop}` : '', '=>', scene.location, '|', scene.present.join(','));
  }
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  const bs = rows.flatMap((r) => (r.b ? [r.b] : []));
  const score = {
    ...scoreRows(rows, set),
    // The bar: ≤ 4 location strings, moves = place changes; new places decide `partOf` by ask vs by rule.
    locations: new Set(rows.flatMap((r) => r.location ?? [])).size,
    moves,
    newPlaces,
    cutReplies: [...rows.map((r) => r.a), ...bs].filter((x) => x.stop === 'length').length,
    meanMsA: mean(rows.map((r) => r.a.ms)),
    meanMsB: mean(bs.map((x) => x.ms)),
  };
  console.log('state score', JSON.stringify(score));
  console.log('wrote', writeMeasurement(`state-${LABEL}`, { url, backup, set: SET, sampling: HELPER_JSON_SAMPLING, score, rows }));
});
