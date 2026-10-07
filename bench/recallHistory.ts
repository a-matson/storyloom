/**
 * The recall bench's recorded history: played once per fact set (`pnpm measure recall-record <url>`),
 * then replayed per depth so only the probes are generated, against the same story every run.
 */
import { z } from 'zod/mini';
import { isPlayerAction } from '@core/memory';
import { seedCanonEntities } from '@core/memory/canon';
import type { Action, Adventure } from '@core/model';
import * as S from '@core/schema';

export const HISTORY_FILE = 'bench/recall-history.json';

/** A fact is honoured or not in its first two sentences; 120 tokens saves ~4 s a generation. [provisional] */
export const HISTORY_SETTINGS = { seed: 7, responseLength: 120 };

export const RecallHistory = z.object({
  format: z.literal('storyloom-recall-history'),
  version: z.literal(1),
  recordedAt: z.string(),
  model: z.optional(z.string()),
  /** Fact ids in table order: a recording made for another fact set is refused. */
  facts: z.array(z.string()),
  /** `actions.length` after story turn `i + 1`. */
  turnEnds: z.array(z.int()),
  adventure: S.Adventure,
});
export type RecallHistory = z.infer<typeof RecallHistory>;

/** A story turn ends on the AI output that answers a player action. */
export const turnEnds = (actions: Pick<Action, 'type'>[]): number[] =>
  actions.flatMap((a, i) => (!isPlayerAction(a) && isPlayerAction(actions[i - 1]) ? [i + 1] : []));

/**
 * Everything maintenance derives, removed, so each replay re-derives it under the code being measured.
 * Canon entities are creation state, not maintenance: they are seeded again from the cards.
 */
export function stripAdventure(a: Adventure): Adventure {
  const { __summaryAt: _s, __entitiesAt: _e, ...scriptState } = a.scriptState;
  const { storySummary: _summary, scene: _scene, ...plot } = a.plot;
  return {
    ...a,
    actions: a.actions.map(({ speakers: _speakers, ...x }) => x),
    plot,
    scriptState,
    memories: [],
    entities: seedCanonEntities(a.storyCards, 0),
  };
}

/** The recorded adventure cut after story turn `depth`, as its own adventure; `seed` overrides the recording's. */
export function sliceHistory(h: RecallHistory, depth: number, seed?: number): Adventure {
  const end = h.turnEnds[depth - 1];
  if (end === undefined) throw new Error(`the recording has ${h.turnEnds.length} story turns, not ${depth}`);
  const a = h.adventure;
  const model = seed === undefined ? a.settings.model : { ...a.settings.model, seed };
  return { ...a, title: `Recall d${depth}`, actions: a.actions.slice(0, end), settings: { ...a.settings, model } };
}
