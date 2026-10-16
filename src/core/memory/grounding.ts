import type { Entity } from '../model/types';
import { entityNamedIn } from './entities';
import { contentWords, SENTENCE } from './support';

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
