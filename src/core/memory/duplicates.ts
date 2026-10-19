import type { Adventure, Entity } from '../model/types';
import { norm, words } from './names';
import { editDistance, SPELLING_MIN } from './spelling';

type Proposal = NonNullable<Adventure['scriptState']['__aliasProposals']>[number];

/** Words before a name that say what someone is, not who: "Father Caradoc" is Caradoc. [provisional] */
export const TITLES = new Set('father brother sister mother lord lady sir captain master mistress old young doctor dr keeper warden'.split(' '));

/** A name's words without titles or "the". */
const wordsOf = (name: string): string[] =>
  words(name)
    .trim()
    .split(' ')
    .filter((w) => w !== '' && w !== 'the' && !TITLES.has(w));
const namesOf = (e: Entity) => [e.name, ...e.aliases].map(wordsOf);
/** Whether one of `a`'s names is some or all of one of `b`'s names' words. */
const inside = (a: Entity, b: Entity) => namesOf(a).some((x) => x.length > 0 && namesOf(b).some((y) => x.every((w) => y.includes(w))));
const one = (hits: Entity[]) => (hits.length === 1 ? hits[0] : undefined);

/** The one other card of `e`'s kind holding all of `e`'s name words; of several, the one holding the rest ("Caradoc Reed" over "Father Caradoc"). Namesakes are not one. */
function holderOf(entities: readonly Entity[], e: Entity): Entity | undefined {
  const hits = entities.filter((x) => x.id !== e.id && x.kind === e.kind && norm(x.name) !== norm(e.name) && inside(e, x));
  return one(hits.filter((x) => !hits.some((y) => y !== x && inside(x, y) && !inside(y, x))));
}

/**
 * The card `e` is a near-duplicate of, same kind, titles stripped: the one whose name holds `e`'s name words
 * (Caradoc of Caradoc Reed), else the one whose name words `e`'s holds. "Reed" beside Caradoc Reed and Tamsin Reed: none.
 */
export const duplicateOf = (entities: readonly Entity[], e: Entity): Entity | undefined =>
  holderOf(entities, e) ?? one(entities.filter((x) => holderOf(entities, x)?.id === e.id));

const TITLED = new Set<Entity['kind']>(['faction', 'place']);
/** Whether a one-word name of character `c` is misspelt, 1-2 edits, inside `t`'s name ("Weaver of Fates" for Weever). */
const misspeltIn = (c: Entity, t: Entity) =>
  namesOf(c).some(
    ([w, ...more]) =>
      w !== undefined &&
      !more.length &&
      w.length >= SPELLING_MIN &&
      wordsOf(t.name).some((x) => x.length >= SPELLING_MIN && editDistance(w, x) > 0 && editDistance(w, x) <= 2),
  );

/** The one card of the other side (a character for a faction or place, else the reverse) whose name `e`'s holds misspelt, or `e`'s the other's. */
export function titleOf(entities: readonly Entity[], e: Entity): Entity | undefined {
  if (e.kind === 'character') return one(entities.filter((t) => TITLED.has(t.kind) && misspeltIn(e, t)));
  return TITLED.has(e.kind) ? one(entities.filter((c) => c.kind === 'character' && misspeltIn(c, e))) : undefined;
}

/**
 * Proposals (`__aliasProposals`) for the cards new or changed since `before`: a near-duplicate's name of the card that came
 * first, or a faction's or place's name of the character it names. None for a name already proposed, or declined (`at` < 0).
 */
export function cardProposals(entities: readonly Entity[], before: readonly Entity[], asked: readonly Proposal[], at: number): Proposal[] {
  const out: Proposal[] = [];
  for (const e of entities.filter((x) => !before.includes(x))) {
    const dup = duplicateOf(entities, e);
    const titled = dup ? undefined : titleOf(entities, e);
    const pair = dup ? [dup, e].toSorted((a, b) => a.firstSeen - b.firstSeen) : titled?.kind === 'character' ? [titled, e] : titled ? [e, titled] : [];
    const [first, later] = pair;
    if (!first || !later) continue;
    const p = { name: later.name, of: first.id, at };
    if (![...asked, ...out].some((q) => norm(q.name) === norm(p.name))) out.push(p);
  }
  return out;
}
