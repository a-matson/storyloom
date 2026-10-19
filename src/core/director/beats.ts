import { actionText, type Action, type Adventure, type Assertion, type Entity } from '../model';

/**
 * One thing a character can do in a scene. `cue` opens the AI reply that plays it, pronoun-free so no pronoun is
 * guessed; `done` matches an event text that shows they did it. [provisional]
 */
interface Beat {
  id: string;
  cue: (name: string) => string;
  done: RegExp;
}

const OBJ = '(?:you|him|her|them|me|us)';

/** The 12 beats, in the milestone's order. [provisional] */
export const BEATS: readonly Beat[] = [
  { id: 'interrupt', cue: (n) => `${n} interrupts: "`, done: new RegExp(String.raw`\binterrupt(?:s|ed|ing)?\b|\bcut ${OBJ} off\b`, 'i') },
  { id: 'leave', cue: (n) => `${n} turns to leave, `, done: /\b(?:left|leaves|leaving|walked out|storm(?:s|ed) off|departed)\b/i },
  { id: 'bargain', cue: (n) => `${n} leans in with an offer: "`, done: /\b(?:bargain|haggl|negotiat)\w*|\boffered (?:a|an) (?:deal|trade)\b/i },
  { id: 'lie', cue: (n) => `${n} lies without blinking: "`, done: /\b(?:lied|lies|lying)\b/i },
  { id: 'confide', cue: (n) => `${n} speaks low, in confidence: "`, done: /\b(?:confid(?:ed|es|ing)|confessed|admitted)\b/i },
  { id: 'threaten', cue: (n) => `${n} makes a threat, cold and plain: "`, done: /\bthreaten\w*/i },
  { id: 'joke', cue: (n) => `${n} grins and jokes: "`, done: /\b(?:jok(?:ed|es|ing)|teased|quipped)\b/i },
  { id: 'demand', cue: (n) => `${n} demands: "`, done: /\bdemand(?:s|ed|ing)?\b/i },
  { id: 'change the subject', cue: (n) => `${n} changes the subject: "`, done: /\b(?:changed|changes|changing) the subject\b|\bdeflect(?:s|ed|ing)?\b/i },
  { id: 'reveal', cue: (n) => `${n} reveals what was held back: "`, done: /\b(?:reveal(?:s|ed|ing)?|disclosed)\b/i },
  {
    id: 'ask for help',
    cue: (n) => `${n} asks for help: "`,
    done: new RegExp(String.raw`\bask(?:s|ed|ing)? (?:${OBJ} )?for help\b|\b(?:begged|pleaded)\b`, 'i'),
  },
  { id: 'act on the goal', cue: (n) => `${n} decides to act, `, done: /\b(?:set out to|went after|made (?:a|his|her|their) move)\b/i },
];

/** The reply opening for `beat` by `name`; a player's own beat ("sing") gets a plain one. [provisional] */
export const cueFor = (beat: string, name: string): string =>
  BEATS.find((b) => b.id === beat.toLowerCase())?.cue(name) ?? `${name} decides to ${beat.toLowerCase()}, `;

type Cast = Pick<Entity, 'name' | 'beats'>;
const beatsOf = (e: Cast) => [...BEATS.map((b) => b.id), ...(e.beats ?? [])];

/** The beat an AI action's text opens with, for one of `cast`; read back from the log, never stored. */
export function cueBeat(text: string, cast: readonly Cast[]): { name: string; beat: string; cue: string } | undefined {
  for (const e of cast)
    for (const beat of beatsOf(e)) {
      const cue = cueFor(beat, e.name);
      if (text.startsWith(cue)) return { name: e.name, beat, cue };
    }
  return undefined;
}

/** The last 3 beats `e` played, oldest first, from the AI actions that open with their cue. */
export const usedBeats = (actions: readonly Action[], e: Cast): string[] =>
  actions.flatMap((a) => (a.type === 'continue' ? (cueBeat(actionText(a), [e])?.beat ?? []) : [])).slice(-3);

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
