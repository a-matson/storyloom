import type { Action, Assertion, Memory, PlotComponents } from '../model/types';
import { actionStoryText } from '../text/formatting';
import { createApproxTokenizer, trimToTokens } from '../text/tokenizer';

/** Tokens one witness clause keeps, range and all. [provisional] */
export const WITNESS_TOKENS = 30;
/** Clauses a cast line carries, the most recent. [provisional] */
export const MAX_GAPS = 2;
// ponytail: a word list over the free-text `condition` value; "dozing" or "in a trance" miss. A typed `aware` key if M13-9's probe needs it.
/** A `condition` the character perceives nothing through. [provisional] */
export const UNAWARE = /asleep|unconscious|passed out|knocked out|out cold/i;

/** Actions `from` to `to` (exclusive) the character did not witness. */
export interface Gap {
  from: number;
  to: number;
  kind: 'away' | 'asleep';
}

type Presence = NonNullable<PlotComponents['presence']>;

/** Runs of `presence` without `id`, after it was first there: nobody is "away" before they enter the story. */
function awayRuns(id: string, presence: Presence, end: number): Gap[] {
  let met = false;
  return presence.flatMap((p, i) => {
    const here = p.present.includes(id);
    const gap = met && !here ? [{ from: p.at, to: presence[i + 1]?.at ?? end, kind: 'away' as const }] : [];
    met ||= here;
    return gap;
  });
}

/**
 * The action ranges inside `window` (`to` inclusive: the last action) where the character was away
 * (`presence`) or unaware (an `UNAWARE` condition, current or ended), merged when they touch, cut to the window.
 */
export function gapsOf(id: string, presence: Presence, as: readonly Assertion[], window: { from: number; to: number }): Gap[] {
  const end = window.to + 1;
  const asleep = as.flatMap((a) =>
    a.kind === 'state' && a.key === 'condition' && a.seen !== false && UNAWARE.test(a.value)
      ? [{ from: a.since, to: a.until ?? end, kind: 'asleep' as const }]
      : [],
  );
  const merged: Gap[] = [];
  for (const g of [...awayRuns(id, presence, end), ...asleep].toSorted((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && g.from <= last.to) last.to = Math.max(last.to, g.to);
    else merged.push({ ...g });
  }
  return merged.flatMap((g) => {
    const from = Math.max(g.from, window.from);
    const to = Math.min(g.to, end);
    return from < to ? [{ ...g, from, to }] : [];
  });
}

const approx = createApproxTokenizer();
const firstSentence = (t: string) => (t.trim().split(/(?<=[.!?])\s/)[0] ?? '').replace(/[.;]+$/, '');

/**
 * `slept through actions 47–55: <text>` / `was away for action 31: <text>`, at most `WITNESS_TOKENS`.
 * `<text>`: the first sentence of the memory overlapping the gap most, else of the gap's first AI output.
 */
export function witnessClause(g: Gap, memories: readonly Memory[], actions: readonly Action[]): string {
  const overlap = (m: Memory) => Math.min(m.toAction, g.to) - Math.max(m.fromAction, g.from);
  const memory = memories.filter((m) => overlap(m) > 0).toSorted((a, b) => overlap(b) - overlap(a))[0];
  const output = actions.slice(g.from, g.to).find((a) => a.type === 'continue');
  const text = firstSentence(memory?.text ?? (output ? actionStoryText(output) : ''));
  const range = g.to - g.from > 1 ? `actions ${g.from}–${g.to - 1}` : `action ${g.from}`;
  const head = `${g.kind === 'asleep' ? 'slept through' : 'was away for'} ${range}`;
  return trimToTokens(text ? `${head}: ${text}` : head, WITNESS_TOKENS, approx);
}
