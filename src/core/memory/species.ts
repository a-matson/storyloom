import type { Assertion, Entity } from '../model/types';
import { newId } from '../model/types';
import { identityText, isCurrent, type AssertionOf } from './assertionIndex';
/** Singular species words an identity and a `species` look are compared by, the M13 export's looks among them. [provisional] */
export const SPECIES_WORDS: readonly string[] =
  'orc kobold minotaur elf dwarf human dragon goblin troll ogre giant gnome halfling centaur vampire werewolf wolf rat cat'.split(' ');

const SPECIES = new RegExp(`(?<![\\p{L}\\p{N}])(?:${SPECIES_WORDS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/** The first species word in `text`, lower-case. */
export const speciesIn = (text: string): string | undefined => SPECIES.exec(text)?.[0].toLowerCase();

/** The identity's species word against the look's, when both have one and they differ ("human" vs "kobold"). */
export function speciesConflict(identity: string, look: string | undefined): { claimed: string; canon: string } | undefined {
  const claimed = speciesIn(identity);
  const canon = look === undefined ? undefined : speciesIn(look);
  return claimed && canon && claimed !== canon ? { claimed, canon } : undefined;
}

/** An open identity-vs-looks conflict: a species conflict the fold raised (`seen: false`), not a locked key's. */
export const isSpeciesClash = (a: Assertion): a is AssertionOf<'conflict'> => a.kind === 'conflict' && a.key === 'species' && a.seen === false && isCurrent(a);

// `currentStates`' species without importing `looks.ts`, which imports this.
const look = (as: readonly Assertion[]) =>
  as.findLast((a): a is AssertionOf<'look'> => a.kind === 'look' && a.key === 'species' && a.seen !== false && isCurrent(a))?.value;

/**
 * `after` (the entity's assertions once a fold merged) with a species conflict when the merge changed
 * the identity or the `species` look and the two now differ; one open per pair. A resolved one is not
 * raised again: Keep canon rewrites the identity, Accept the look. A canon or carded entity's identity is the player's card.
 */
export function flagSpecies(
  e: Pick<Entity, 'id' | 'canon' | 'cardId' | 'description'>,
  before: readonly Assertion[],
  after: readonly Assertion[],
  at: number,
  producer: Assertion['producer'],
): Assertion[] {
  const id = (as: readonly Assertion[]) => identityText(e, as);
  if (e.canon || e.cardId || (id(before) === id(after) && look(before) === look(after))) return [...after];
  const clash = speciesConflict(id(after), look(after));
  if (!clash || after.some((a) => isSpeciesClash(a) && a.claimed === clash.claimed && a.canon === clash.canon)) return [...after];
  return [...after, { id: newId('as_'), subject: e.id, producer, at, basis: 'inferred', since: at, kind: 'conflict', key: 'species', ...clash, seen: false }];
}

/** `text` with the whole word `from` as `to`, a capital kept ("Orc" → "Minotaur"); `to` empty drops it. */
export function swapWord(text: string, from: string, to: string): string {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${from}(?![\\p{L}\\p{N}])`, 'giu');
  const out = text.replace(re, (m) => (to && m[0] !== m[0]?.toLowerCase() ? to[0]?.toUpperCase() + to.slice(1) : to));
  return to
    ? out
    : out
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;])/g, '$1')
        .trim();
}
