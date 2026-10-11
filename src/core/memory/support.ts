import type { Action, Entity } from '../model/types';
import { actionText } from '../model/types';
import { entityNamedIn } from './entities';
import type { Source } from './invalidate';

/** Words that carry nothing a value could be backed by. [provisional] */
const STOP = new Set(
  'the and but with that this from have has had was were are his her its their they them she him who what when where which into onto over under than then there here been will would could about after before your you not'.split(
    ' ',
  ),
);

/** Compared by their first five letters, so "blinded" meets "blind". [provisional] */
const contentWords = (s: string): string[] => [
  ...new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5))),
];

/** Share of a value's content words one sentence must hold for `stated`; fewer is `inferred`. [provisional] */
const STATED = 0.8;

const SENTENCE = /[^.!?\n]+[.!?]*/g;

/**
 * Evidence computed, not quoted: the 12B reworded its quotes, so they failed the substring check.
 * When `actions` name the subject, the sentence sharing most of `value`'s content words becomes
 * the value's source; `stated` when it holds nearly all of them. Else why there is none.
 * Requiring the name in the same or the previous action left 9 facts where the old reply kept 15.
 * [measured: 2026-10-11-recall-m12-1-pr2-hybrid-d30.json]
 */
export function supportOf(actions: readonly Action[], subject: Pick<Entity, 'name' | 'aliases'>, value: string): Source | 'wrong-subject' | 'no-shared-word' {
  if (!actions.some((a) => entityNamedIn([subject], actionText(a)))) return 'wrong-subject';
  const want = contentWords(value);
  let best: { a: Action; sentence: string; hits: number } | undefined;
  for (const a of actions)
    for (const [s] of actionText(a).matchAll(SENTENCE)) {
      const have = new Set(contentWords(s));
      const hits = want.filter((w) => have.has(w)).length;
      if (hits > (best?.hits ?? 0)) best = { a, sentence: s.trim(), hits };
    }
  if (!best) return 'no-shared-word';
  return { sourceId: best.a.id, evidence: best.sentence, basis: best.hits >= STATED * want.length ? 'stated' : 'inferred' };
}
