import type { Entity, Scene } from '../model/types';
import { visibleFrom } from '../memory/bodyPlan';
import { YOU } from '../memory/you';
import { seedOf } from '../trace';
import type { SheetFamily } from './sheet';
import { stateTags } from './stateTags';
import { countTag, lookTags, placeTag, tags } from './tags';
import { type Frame, frameOf, inFrame } from './framing';
import { saysYou, viewOf } from './view';

/**
 * A See input is a brief: what the picture shows. The prompt sent to the image server is composed
 * from it, the scene and the cast's looks, so character names never reach the server (SD 1.5 does
 * not know who "Tamsin" is; a name only adds noise).
 */

/** SD 1.5 blends attributes once a prompt holds more than two people. [provisional] */
export const CAST_CAP = 2;
/** CLIP reads 75 tokens; ~4 characters a token. [provisional] */
export const PROMPT_BUDGET = 300;

/** `description`, `appearance`, `looks` and `states` as `withLooks` resolves them from the assertions; `holds` are item ids. */
type Character = Pick<Entity, 'id' | 'kind' | 'name' | 'aliases' | 'description' | 'look'> & {
  appearance?: string;
  looks?: Readonly<Record<string, string>>;
  states?: Readonly<Record<string, string>>;
  holds?: readonly string[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = (n: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.trim())}(?![\\p{L}\\p{N}])`, 'giu');
const namesOf = (e: Character) => [e.name, ...e.aliases].filter((n) => n.trim() !== '');
/** Any of a character's names, longest first, with a trailing possessive. */
const mentionRe = (e: Character) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${namesOf(e)
      .toSorted((a, b) => b.length - a.length)
      .map((n) => escape(n.trim()))
      .join('|')})(?![\\p{L}\\p{N}])(?:['’]s(?![\\p{L}\\p{N}]))?`,
    'giu',
  );

type Kind = Entity['kind'];
const ANY: readonly Kind[] = ['character', 'item', 'faction', 'place'];

/** Entities of `kinds` that `text` names as whole words, in order of first mention; a longer name wins an overlap ("Lena Morrow" over "Lena"). */
export function namedCast<E extends Character>(text: string, entities: readonly E[], kinds: readonly Kind[] = ['character']): E[] {
  const hits = entities
    .filter((e) => kinds.includes(e.kind))
    .flatMap((e) => namesOf(e).flatMap((n) => [...text.matchAll(nameRe(n))].map((m) => ({ e, at: m.index, end: m.index + m[0].length }))))
    .toSorted((a, b) => b.end - b.at - (a.end - a.at));
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.some((k) => h.at < k.end && k.at < h.end)) kept.push(h);
  return [...new Set(kept.toSorted((a, b) => a.at - b.at).map((h) => h.e))];
}

/** Every entity `brief` names, of any kind. */
export const namedIn = <E extends Character>(brief: string, entities: readonly E[]): E[] => namedCast(brief, entities, ANY);

/**
 * What the picture shows: the characters the brief names, then its items and factions. The scene's present
 * characters only when the brief names no entity at all, so "Goldarok marches" borrows nobody's look or seed.
 */
export function subjectsIn<E extends Character>(brief: string, scene: Scene | undefined, entities: readonly E[]): E[] {
  const named = namedIn(brief, entities);
  if (named.length === 0) return [...new Set((scene?.present ?? []).flatMap((p) => namedCast(p, entities).slice(0, 1)))];
  return [...named.filter((e) => e.kind === 'character'), ...named.filter((e) => e.kind === 'item' || e.kind === 'faction')];
}

/** A brief that points at someone without naming them: the helper model resolves "she" from the story. [provisional] */
export function isImplicit(brief: string, named: readonly unknown[]): boolean {
  return named.length === 0 && (brief.match(/,/g)?.length ?? 0) < 4 && /\b(she|he|they|her|him|it)\b/i.test(brief);
}

/** What a place looks like, without its name; empty when neither its description nor its name shows anything. */
const placeOf = (e: Character) => placeTag(e.description) || placeTag(e.name);

/** What an entity is, without its name: "Tamsin is a ferrywoman who…" → "a ferrywoman". */
function noun(e: Character): string {
  if (e.kind === 'place') return placeOf(e) || 'a place';
  // Not `:`: a "species: dragon" description would yield the noun "species".
  const first = e.description.split(/[,.;\n]/)[0] ?? '';
  const lead = new RegExp(`^\\s*(?:the\\s+)?(?:${namesOf(e).map(escape).join('|')})\\s+(?:is|was)\\s+`, 'i');
  const n = first.replace(lead, '').trim();
  // An item's name in its noun ("a brass horn" for Horn) is no proper noun to hide.
  const ok = n !== '' && (e.kind === 'item' || !namesOf(e).some((x) => nameRe(x).test(n)));
  // "A young scribe." opens a sentence; mid-prompt it is a tag.
  if (ok) return n.replace(/^A(n)? /, (a) => a.toLowerCase());
  return e.kind === 'item' ? e.name.toLowerCase() : e.kind === 'faction' ? 'a group' : 'a person';
}

const looks = (e: Character, full: boolean) => [noun(e), full ? (e.appearance ?? '') : ''].filter(Boolean).join(', ');
/** A character's current look without their name, from what the story says: what a new reference freezes. */
export const looksOf = (e: Character): string => looks(e, true);
/** What a See repeats for them: the frozen look when the player set a reference, else `looksOf`. */
export const lookFor = (e: Character): string => e.look ?? looks(e, true);

/** One character with a frozen look keeps their face across Sees; a fixed seed for any other cast would only repeat the layout. [provisional] */
export const seedFor = (cast: readonly Character[]): number | undefined => {
  const [only] = cast;
  return cast.length === 1 && only?.look !== undefined ? seedOf(only.id) : undefined;
};

// "golden dragon" beside `dragon, gold scales` says it twice. [provisional]
const BODY_COLOUR = ['skin', 'scales'];
const saysItAll = (l: Readonly<Record<string, string>>) => Boolean(l['species']?.trim()) && BODY_COLOUR.some((k) => l[k]?.trim());

/**
 * One character in the subject block: the frozen look verbatim, else the noun and the looks as tags; with `full` off, the noun.
 * With `parts`, the body parts their identity names join the looks (a look of the same key wins).
 */
function subject(e: Character, full: boolean, family: SheetFamily, keys: Frame['keys'], parts: boolean): string {
  const named = parts ? Object.fromEntries(visibleFrom(e.description).map((w) => [w, w])) : {};
  const shows = inFrame({ ...named, ...e.looks }, keys);
  if (e.id === YOU) return tags(['pov', full ? lookTags(shows, family) : '']);
  if (!full || e.kind !== 'character') return noun(e);
  // ponytail: a frozen string look is not cut to the frame; M29-9 makes it per key.
  if (e.look !== undefined) return e.look;
  if (!e.looks || Object.keys(e.looks).length === 0) return looks(e, true);
  return tags([saysItAll(e.looks) ? '' : noun(e), lookTags(shows, family)]);
}

export interface ComposeInput {
  brief: string;
  /** Undefined for a helper-written line: the helper already saw the scene and the looks. */
  scene?: Scene | undefined;
  entities: readonly Character[];
  style: string;
  family: SheetFamily;
  /** Who the picture shows when the brief cannot say: a helper's line names nobody. */
  cast?: readonly Character[] | undefined;
}

export type Blocks = Record<'subject' | 'state' | 'story' | 'scene' | 'style', string>;

const joined = (b: Blocks) => tags([b.subject, b.state, b.story, b.scene, b.style]);

/** The scene's place as a tag: a place entity by how it looks, an unknown location only when it holds no proper noun. */
function placeIn(location: string | undefined, entities: readonly Character[]): string {
  if (!location) return '';
  const place = entities.find((e) => e.kind === 'place' && namesOf(e).includes(location));
  return place ? placeOf(place) : /\p{Lu}/u.test(location) ? '' : location;
}

/**
 * `framing, count, subject (each shown character's looks in frame), state, view, brief (names → nouns), location, weather, style`.
 * Looks never enter the brief: spliced in, their last tag fused with the verb after it. Over budget it
 * drops, in order: the body parts named only in identities, the second character's looks, the state, the weather, the first character's looks, then cuts at a comma.
 */
export function composeSeePrompt(input: ComposeInput): { prompt: string; entityIds: string[]; seed?: number; blocks: Blocks } {
  const { brief, scene, entities, style, family } = input;
  const frame = frameOf(brief);
  const keys = frame?.keys ?? 'all';
  const view = viewOf(frame?.brief ?? brief);
  // The player is drawn only as the camera, and only when the brief says "you" and the You card has looks.
  const you = saysYou(brief) ? entities.find((e) => e.id === YOU && Object.keys(e.looks ?? {}).length > 0) : undefined;
  const others = (input.cast ?? subjectsIn(view.brief, scene, entities)).filter((e) => e.id !== YOU);
  const shown = [...others.slice(0, you ? CAST_CAP - 1 : CAST_CAP), ...(you ? [you] : [])];
  const people = shown.filter((e) => e.kind === 'character');
  // Every entity's name goes, shown or not; a possessive goes with it ("Bram's hat" → "a toll keeper hat").
  const story = namedIn(view.brief, entities).reduce((t, e) => t.replace(mentionRe(e), () => noun(e)), view.brief);
  const held = (e: Character) => (e.holds ?? []).flatMap((id) => entities.filter((x) => x.id === id).map(noun));
  // Out of frame, a posture or a held sword only pulls the camera back.
  const states = frame?.states ?? 'all';
  const state = tags(people.map((e) => stateTags(inFrame(e.states ?? {}, states), states === 'all' ? held(e) : [], family, brief)));
  const build = (full: readonly boolean[], withState: boolean, weather: boolean, parts = false): Blocks => ({
    subject: tags([frame?.tag, countTag(people.length, family), ...shown.map((e, i) => subject(e, full[i] ?? false, family, keys, parts))]),
    state: withState ? state : '',
    story: tags([...view.tags, story]),
    scene: tags([placeIn(scene?.location, entities), weather ? scene?.weather : '']),
    style: tags([style]),
  });
  const last = build([false, false], false, false);
  const blocks =
    [
      build([true, true], true, true, true),
      build([true, true], true, true),
      build([true, false], true, true),
      build([true, false], false, true),
      build([true, false], false, false),
    ].find((b) => joined(b).length <= PROMPT_BUDGET) ?? last;
  const seed = seedFor(people);
  return { prompt: cut(joined(blocks)), entityIds: shown.map((e) => e.id), ...(seed !== undefined && { seed }), blocks };
}

function cut(text: string): string {
  if (text.length <= PROMPT_BUDGET) return text;
  const head = text.slice(0, PROMPT_BUDGET);
  const comma = head.lastIndexOf(',');
  return (comma > 0 ? head.slice(0, comma) : head).trim();
}
