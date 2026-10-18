import { UNAWARE } from '../context/witness';
import type { Entity } from '../model/types';
import { entityNamedIn } from './entities';
import { contentWords, SENTENCE } from './support';

/** Values that end the current one of their key; the story need not say them ("she blinks" ends asleep). [provisional] */
const ENDS: Record<string, readonly { value: RegExp; ends: RegExp }[]> = {
  condition: [{ value: /^awake$|^conscious$|wakes?/i, ends: UNAWARE }],
  posture: [{ value: /^stand|^upright/i, ends: /lying|prone|sprawled/i }],
};

/** An ungrounded value still stands when it ends the current one; with no current value it stays a proposal. */
export const endsCurrent = (key: string, value: string, current: string | undefined): boolean =>
  current !== undefined && (ENDS[key] ?? []).some((e) => e.value.test(value) && e.ends.test(current));

/** Story wordings of a condition that share no word with it. [provisional] */
const CONDITION_SYNONYMS: Record<string, readonly string[]> = {
  unconscious: ['out cold', 'knocked out', 'passed out', 'senseless'],
  asleep: ['sleeps', 'dozing', 'snoring'],
  hurt: ['wound', 'bleeding', 'bruised', 'injured'],
  drunk: ['slurring', 'reeling', 'tipsy'],
};

// The shared stemmer leaves "sitting" as "sitt" beside "sits" → "sit".
const words = (s: string) => contentWords(s).map((w) => w.replace(/([^aeiou])\1$/, '$1'));

/** A value stands on `text` when one of its content words, or a synonym of a condition it names, is there. */
export function grounded(value: string, text: string): boolean {
  const have = new Set(words(text));
  if (words(value).some((w) => have.has(w))) return true;
  const v = value.toLowerCase();
  const t = text.toLowerCase();
  return Object.entries(CONDITION_SYNONYMS).some(([k, alt]) => v.includes(k) && alt.some((a) => t.includes(a)));
}

/** The first candidate named in a sentence that also says the condition; a name in another sentence is no cause (F11). */
export function causeIn<E extends Pick<Entity, 'name' | 'aliases'>>(text: string, condition: string, candidates: readonly E[]): E | undefined {
  for (const [s] of text.matchAll(SENTENCE)) {
    const hit = grounded(condition, s) ? entityNamedIn(candidates, s) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
