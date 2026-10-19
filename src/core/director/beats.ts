import type { Adventure, Assertion, Entity } from '../model';

/** One thing a character can do in a scene; `done` matches an event text that shows they did it. [provisional] */
interface Beat {
  id: string;
  done: RegExp;
}

const OBJ = '(?:you|him|her|them|me|us)';

/** The 12 beats, in the milestone's order. [provisional] */
export const BEATS: readonly Beat[] = [
  { id: 'interrupt', done: new RegExp(String.raw`\binterrupt(?:s|ed|ing)?\b|\bcut ${OBJ} off\b`, 'i') },
  { id: 'leave', done: /\b(?:left|leaves|leaving|walked out|storm(?:s|ed) off|departed)\b/i },
  { id: 'bargain', done: /\b(?:bargain|haggl|negotiat)\w*|\boffered (?:a|an) (?:deal|trade)\b/i },
  { id: 'lie', done: /\b(?:lied|lies|lying)\b/i },
  { id: 'confide', done: /\b(?:confid(?:ed|es|ing)|confessed|admitted)\b/i },
  { id: 'threaten', done: /\bthreaten\w*/i },
  { id: 'joke', done: /\b(?:jok(?:ed|es|ing)|teased|quipped)\b/i },
  { id: 'demand', done: /\bdemand(?:s|ed|ing)?\b/i },
  { id: 'change the subject', done: /\b(?:changed|changes|changing) the subject\b|\bdeflect(?:s|ed|ing)?\b/i },
  { id: 'reveal', done: /\b(?:reveal(?:s|ed|ing)?|disclosed)\b/i },
  { id: 'ask for help', done: new RegExp(String.raw`\bask(?:s|ed|ing)? (?:${OBJ} )?for help\b|\b(?:begged|pleaded)\b`, 'i') },
  { id: 'act on the goal', done: /\b(?:set out to|went after|made (?:a|his|her|their) move)\b/i },
];

/** The first 10 beats: a tag-less or unknown-genre adventure's repertoire. [provisional] */
export const DEFAULT_BEATS: readonly string[] = BEATS.slice(0, 10).map((b) => b.id);

/** Per `QUICK_STARTS` tag. [provisional] */
export const GENRE_BEATS: Readonly<Record<string, readonly string[]>> = {
  fantasy: ['bargain', 'threaten', 'lie', 'confide', 'reveal', 'ask for help', 'act on the goal', 'leave', 'joke', 'demand'],
  mystery: ['lie', 'change the subject', 'interrupt', 'reveal', 'confide', 'demand', 'leave', 'threaten', 'bargain'],
  'sci-fi': ['demand', 'reveal', 'ask for help', 'interrupt', 'lie', 'act on the goal', 'bargain', 'confide', 'leave'],
  'slice-of-life': ['joke', 'confide', 'change the subject', 'ask for help', 'interrupt', 'leave', 'reveal', 'bargain'],
};

const key = (s: string) => s.trim().toLowerCase().replaceAll(/\s+/g, '-');

/** The genre keys of an adventure: its tags, then its title (a Quick Start's is its genre and it carries no tags). */
export const genreKeys = (adv: Pick<Adventure, 'tags' | 'title'>): string[] => [...adv.tags, adv.title].map(key);

/** The stored list (`[]` = none), else the first known genre's default. */
export function repertoire(e: Pick<Entity, 'beats'>, genres: readonly string[]): readonly string[] {
  return e.beats ?? genres.map((g) => GENRE_BEATS[key(g)]).find((b) => b !== undefined) ?? DEFAULT_BEATS;
}

/** Beats the character's own current events show at least twice that are not in the repertoire yet; derived, never stored. */
export function suggestedBeats(e: Pick<Entity, 'id' | 'beats'>, assertions: readonly Assertion[], genres: readonly string[]): string[] {
  const texts = assertions.flatMap((a) => (a.kind === 'event' && a.until === undefined && a.who[0] === e.id ? [a.text] : []));
  const has = new Set(repertoire(e, genres).map((b) => b.toLowerCase()));
  return BEATS.filter((b) => !has.has(b.id) && texts.filter((t) => b.done.test(t)).length >= 2).map((b) => b.id);
}

/** A player's list: trimmed, no empties, no case-insensitive repeats, at most 12. */
export const cleanBeats = (beats: readonly string[]): string[] =>
  [
    ...new Map(
      beats
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => [b.toLowerCase(), b] as const),
    ).values(),
  ].slice(0, BEATS.length);
