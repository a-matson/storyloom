import type { Adventure, Assertion, Entity } from '../model/types';
import { actionText } from '../model/types';
import { STOP } from './admit';
import { current, identityText, indexAssertions, isCurrent } from './assertionIndex';
import { PLAYER } from './bodyPlan';
import { COMMON_WORDS } from './commonWords';
import { entityNamedIn } from './entities';
import { byPlayer, isValue, valueOf } from './looks';
import type { MemoryRange } from './memoryBank';
import { SPECIES_WORDS, speciesIn, swapWord } from './species';
import { SENTENCE, stem } from './support';

/** Nouns an identity calls a character by before the player names its species. [provisional] */
const PERSON = /(?<![\p{L}\p{N}])(?:man|woman|boy|girl|person|human)(?![\p{L}\p{N}])/iu;
/** "the dragon that owes you": a species picked out by what it did. [provisional] */
const THE_ONE = new RegExp(`\\bthe (${SPECIES_WORDS.join('|')}) (?:that|who|which) (.+)`, 'i');

/** Rare words (4+ letters, not everyday) a clause and an identity can share, stemmed. [provisional] */
const rare = (s: string): Set<string> =>
  new Set((s.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 4 && !STOP.has(w) && !COMMON_WORDS.has(w)).map(stem));

/** The species a player sentence gives `e`: a species word beside its name, or "the <species> that…" bound to it alone. */
function declares(sentence: string, e: Entity, identities: ReadonlyMap<Entity, Set<string>>): string | undefined {
  const named = entityNamedIn([e], sentence) ? speciesIn(sentence) : undefined;
  if (named) return named;
  const [, word, clause = ''] = sentence.match(THE_ONE) ?? [];
  if (!word) return undefined;
  const said = rare(clause);
  const bound = [...identities].filter(([, ws]) => [...ws].some((w) => said.has(w)));
  return bound.length === 1 && bound[0]?.[0] === e ? word.toLowerCase() : undefined;
}

/**
 * A character the player's lines (any so far: a card made at #6 still takes the line at #1) give a species, with no player
 * species yet, gets it as the player's: the model's species ends, and an identity that called it a man or another species
 * says the declared one. A canon or carded identity is the player's card and stays. Returns how many were declared.
 */
export function speciesFromPlayer(adventure: Adventure, range: MemoryRange): number {
  const ix = indexAssertions(adventure.assertions);
  const chars = adventure.entities.filter((e) => e.kind === 'character');
  const identities = new Map(chars.map((e) => [e, rare(identityText(e, ix.of(e.id)))]));
  const lines = adventure.actions.slice(0, range.toAction).flatMap((a, at) => (PLAYER.has(a.type) ? [{ at, text: actionText(a) }] : []));
  let declared = 0;
  for (const e of chars) {
    const own = ix.of(e.id);
    if (own.some((a) => isValue(a) && isCurrent(a) && a.key === 'species' && a.basis === 'player')) continue;
    const found = lines.flatMap(({ at, text }) => [...text.matchAll(SENTENCE)].map(([s]) => ({ at, word: declares(s, e, identities) }))).find((d) => d.word);
    if (!found?.word) continue;
    const { at, word } = found;
    // A value or identity read after the line ends where it began, so no span runs backwards.
    const end = (a: Assertion): Assertion => ({ ...a, until: Math.max(at, a.since) });
    const id = e.canon || e.cardId ? undefined : current(own, 'identity').at(-1);
    const old = id && (speciesIn(id.text) ?? id.text.match(PERSON)?.[0]);
    const swapped = id && old && old.toLowerCase() !== word ? swapWord(id.text, old, word) : undefined;
    const ended = new Set(own.filter((a) => (isValue(a) && isCurrent(a) && a.key === 'species') || (swapped !== undefined && a === id)));
    const added = [byPlayer(e.id, at, valueOf('species', word)), ...(swapped ? [byPlayer(e.id, at, { kind: 'identity', text: swapped })] : [])];
    adventure.assertions = [...adventure.assertions.map((a) => (ended.has(a) ? end(a) : a)), ...added];
    declared++;
  }
  return declared;
}
