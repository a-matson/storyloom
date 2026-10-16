import type { Entity } from '../model/types';
import { midSentence } from './entities';

type Kind = Entity['kind'];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the passage around a name says it is. Not `across`/`through`: "through the Formica" is a tabletop. [provisional] */
const CUES: Record<'place' | 'faction' | 'item', (n: string) => RegExp> = {
  place: (n) => new RegExp(`\\b(?:in|at|to|from|into|outside|inside|near|of|over) (?:the )?${n}(?![\\p{L}\\p{N}])`, 'iu'),
  faction: (n) => new RegExp(`\\b${n}(?:['’]s)? (?:men|members|guards|enforcers|people|crew|gang)\\b|\\bthe ${n} (?:are|were|have)\\b`, 'iu'),
  item: (n) => new RegExp(`\\b(?:picks? up|hands?|holds?|draws?|carries|pockets?) (?:the |an? )?${n}(?![\\p{L}\\p{N}])`, 'iu'),
};

/** The kinds whose cue some text matches for `name`. */
export function cuedKinds(name: string, texts: readonly string[]): Kind[] {
  const n = esc(name);
  return (['place', 'faction', 'item'] as const).filter((k) => texts.some((t) => CUES[k](n).test(t)));
}

/**
 * The kind of a new card: the helper confuses places and factions ("East End", "London" as factions),
 * so a `faction` or `place` reply takes the one kind the passage cues. A character or item reply stays.
 */
export function kindOf(name: string, kind: Kind, texts: readonly string[]): Kind {
  if (kind !== 'faction' && kind !== 'place') return kind;
  const [only, ...more] = cuedKinds(name, texts);
  return only && !more.length ? only : kind;
}

/** Every mid-sentence sighting writes `name` right after "the" ("across the Formica"): a thing, not a name. */
export function articleOnly(name: string, texts: readonly string[]): boolean {
  const before = texts.flatMap((t) => midSentence(t, name));
  return before.length > 0 && before.every((b) => /(?<![\p{L}'’])the$/iu.test(b));
}
