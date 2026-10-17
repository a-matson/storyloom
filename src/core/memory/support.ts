import type { Action, Entity } from '../model/types';
import { actionText } from '../model/types';
import { entityNamedIn } from './entities';
import type { Source } from './invalidate';
import { STOP } from './admit';

/**
 * One -ing, -ed or -s off, then a final -e, then the first five letters: "lean" meets "leans" and
 * "eye" meets "eyes" (five letters alone missed both; no-shared-word 10 → 0 at d30).
 * [measured: 2026-10-11-recall-m12-1-pr5-stem-d30.json]
 * ponytail: a crude stemmer ("string" → "str" misses "strings"); a real lemmatiser if it costs facts.
 */
const stem = (w: string): string => {
  const s = w.replace(/(?:ing|ed|(?<!s)s)$/, '');
  const t = s.length >= 3 ? s : w;
  return (t.length > 3 ? t.replace(/e$/, '') : t).slice(0, 5);
};

export const contentWords = (s: string): string[] => [
  ...new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map(stem)),
];

/** Share of a value's content words one sentence must hold for `stated`; fewer is `inferred`. [provisional] */
const STATED = 0.8;

export const SENTENCE = /[^.!?\n]+[.!?]*/g;

/**
 * Evidence computed, not quoted: the 12B reworded its quotes, so they failed the substring check.
 * When `actions` name the subject, the sentence sharing most of `value`'s content words becomes
 * the value's source; `stated` when it holds nearly all of them. Else why there is none.
 * Requiring the name in the same or the previous action left 9 facts where the old reply kept 15.
 * [measured: 2026-10-11-recall-m12-1-pr2-hybrid-d30.json]
 */
export function supportOf(actions: readonly Action[], subject: Pick<Entity, 'name' | 'aliases'>, value: string): Source | 'wrong-subject' | 'no-shared-word' {
  if (!actions.some((a) => entityNamedIn([subject], actionText(a)))) return 'wrong-subject';
  return bestOf(actions, contentWords(value), () => true);
}

/**
 * `supportOf` from the sentences that name the subject only, its name's own words left out of
 * `value`: Weever's identity once came from the sentence about Vorthak beside it (read D).
 */
export function supportNaming(actions: readonly Action[], subject: Pick<Entity, 'name' | 'aliases'>, value: string): Source | 'no-shared-word' {
  const own = new Set(contentWords([subject.name, ...subject.aliases].join(' ')));
  const want = contentWords(value).filter((w) => !own.has(w));
  return bestOf(actions, want, (s) => !!entityNamedIn([subject], s));
}

function bestOf(actions: readonly Action[], want: readonly string[], counts: (sentence: string) => boolean): Source | 'no-shared-word' {
  let best: { a: Action; sentence: string; hits: number } | undefined;
  for (const a of actions)
    for (const [s] of actionText(a).matchAll(SENTENCE)) {
      if (!counts(s)) continue;
      const have = new Set(contentWords(s));
      const hits = want.filter((w) => have.has(w)).length;
      if (hits > (best?.hits ?? 0)) best = { a, sentence: s.trim(), hits };
    }
  if (!best) return 'no-shared-word';
  return { sourceId: best.a.id, evidence: best.sentence, basis: best.hits >= STATED * want.length ? 'stated' : 'inferred' };
}
