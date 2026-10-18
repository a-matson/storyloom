import type { Entity } from '../model/types';
import { midSentence } from './entities';
import { SPECIES_WORDS } from './species';

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

/** A creature or person word before a name ("dragon Goldarok") or after it ("Goldarok, the dragon"). [provisional] */
const CREATURE = [...SPECIES_WORDS, ...'man woman boy girl beast creature monster wyrm serpent lord lady king queen'.split(' ')]
  // Either case by hand: under `i`, `\p{Lu}` matches lower case too.
  .map((w) => `[${w[0]}${w[0]?.toUpperCase()}]${w.slice(1)}`)
  .join('|');

/**
 * Whether some text calls `name` a creature or person: the word right before it, capitalised words
 * between allowed ("the ancient dragon Lord Goldarok"), or an appositive after it ("Goldarok, the old
 * red dragon"). Only capitalised words may sit between, so "the man of Halven" is no cue.
 */
export function creatureCued(name: string, texts: readonly string[]): boolean {
  const n = esc(name);
  const before = new RegExp(`\\b(?:${CREATURE}) (?:\\p{Lu}[\\p{L}'’-]* ){0,3}${n}(?![\\p{L}\\p{N}])`, 'u');
  const after = new RegExp(`\\b${n}, (?:the|a|an) (?:[\\p{L}-]+ ){0,2}(?:${CREATURE})(?![\\p{L}\\p{N}'’])`, 'u');
  return texts.some((t) => before.test(t) || after.test(t));
}

/**
 * The kind of a new card: a creature cue makes any reply a character ("the dragon Goldarok" as a
 * faction). Else the helper confuses places and factions ("East End", "London" as factions), so a
 * `faction` or `place` reply takes the one kind the passage cues. A character or item reply stays.
 */
export function kindOf(name: string, kind: Kind, texts: readonly string[]): Kind {
  if (kind !== 'character' && creatureCued(name, texts)) return 'character';
  if (kind !== 'faction' && kind !== 'place') return kind;
  const [only, ...more] = cuedKinds(name, texts);
  return only && !more.length ? only : kind;
}

/** Every mid-sentence sighting writes `name` right after "the" ("across the Formica"): a thing, not a name. */
export function articleOnly(name: string, texts: readonly string[]): boolean {
  const before = texts.flatMap((t) => midSentence(t, name));
  return before.length > 0 && before.every((b) => /(?<![\p{L}'’])the$/iu.test(b));
}
