import type { Entity, Scene } from '../model/types';
import { visibleFrom } from '../memory/bodyPlan';
import { YOU } from '../memory/you';
import { seedOf } from '../trace';
import type { SheetFamily } from './sheet';
import { stateTags } from './stateTags';
import { tag } from '../memory/looks';
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
/** A1111 reads a longer prompt in 75-token chunks; SDXL is trusted to bind across two, SD 1.5 is not. [provisional until the chunk check] */
export const budgetFor = (family: SheetFamily): number => (family === 'sdxl' ? 2 * PROMPT_BUDGET : PROMPT_BUDGET);

/** `description`, `appearance`, `looks` and `states` as `withLooks` resolves them from the assertions; `holds` are item ids. */
type Character = Pick<Entity, 'id' | 'kind' | 'name' | 'aliases' | 'description' | 'look' | 'portraitId'> & {
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

/** `text` with every entity's name as its noun; a possessive goes with it ("Bram's hat" → "a toll keeper hat"). */
export const unnamed = (text: string, entities: readonly Character[]): string =>
  namedIn(text, entities).reduce((t, e) => t.replace(mentionRe(e), () => noun(e)), text);

const looks = (e: Character, full: boolean) => [noun(e), full ? (e.appearance ?? '') : ''].filter(Boolean).join(', ');
/** A character's current looks by key, without their name: what a new reference freezes. With no keyed look, the old free text as `legacy`. */
export const looksOf = (e: Character): Record<string, string> => (e.looks && Object.keys(e.looks).length > 0 ? { ...e.looks } : { legacy: looks(e, true) });
/** A frozen look by key; a string one (frozen before M29-9) is one `legacy` run. */
export const lookKeys = (look: NonNullable<Entity['look']>): Record<string, string> => (typeof look === 'string' ? { legacy: look } : look);
/** What the helper model reads for them: the frozen look when the player set a reference, else the noun and the story's looks. */
export function lookFor(e: Character): string {
  if (e.look === undefined) return looks(e, true);
  const l = lookKeys(e.look);
  if (l['legacy'] !== undefined && Object.keys(l).length === 1) return l['legacy'];
  return tags([noun(e), ...Object.entries(l).map(([k, v]) => (k === 'legacy' ? v : tag(k, v)))]);
}

/** Which looks stay as the budget tightens: what the body is and its colours first, marks last; other keys after these. [provisional] */
const KEY_PRIORITY = ['species', 'body', 'skin', 'scales', 'palette', 'hair', 'horns', 'eyes', 'build', 'face', 'wearing', 'marks', 'accessories'];
const rank = (k: string) => (k === 'legacy' ? Infinity : KEY_PRIORITY.includes(k) ? KEY_PRIORITY.indexOf(k) : KEY_PRIORITY.length);
/** The `keep` most telling looks; `legacy` is one run, kept last. */
const topKeys = (l: Readonly<Record<string, string>>, keep: number): Record<string, string> =>
  Object.fromEntries(
    Object.entries(l)
      .toSorted(([a], [b]) => rank(a) - rank(b))
      .slice(0, keep),
  );

/**
 * One character with a frozen look keeps their face across Sees, and so does one the brief names who has a portrait
 * (drawn on the same seed); a fixed seed for any other cast would only repeat the layout. [provisional]
 */
export const seedFor = (cast: readonly Character[], named: readonly Character[]): number | undefined => {
  const [only] = cast;
  if (cast.length !== 1 || !only) return undefined;
  const drawn = only.portraitId !== undefined && named.some((e) => e.id === only.id);
  return only.look !== undefined || drawn ? seedOf(only.id) : undefined;
};

// "golden dragon" beside `dragon, gold scales` says it twice. [provisional]
const BODY_COLOUR = ['skin', 'scales'];
const saysItAll = (l: Readonly<Record<string, string>>) => Boolean(l['species']?.trim()) && BODY_COLOUR.some((k) => l[k]?.trim());

/**
 * One character in the subject block: the noun and the `keep` most telling looks in frame as tags (the frozen ones
 * when the player set a reference); with `keep` 0, the noun. A legacy free-text look is one run, sent whole in any frame.
 * With `parts`, the body parts their identity names join the looks (a look of the same key wins).
 */
function subject(e: Character, keep: number, family: SheetFamily, keys: Frame['keys'], parts: boolean): string {
  const own = e.look !== undefined ? lookKeys(e.look) : e.looks;
  const named = parts ? Object.fromEntries(visibleFrom(e.description).map((w) => [w, w])) : {};
  const framed = { ...inFrame({ ...named, ...own }, keys), ...(own?.['legacy'] !== undefined && { legacy: own['legacy'] }) };
  const { legacy, ...shows } = topKeys(framed, keep);
  if (e.id === YOU) return tags(['pov', lookTags(shows, family)]);
  if (keep === 0 || e.kind !== 'character') return noun(e);
  if (!own || Object.keys(own).length === 0) return looks(e, true);
  if (legacy !== undefined && Object.keys(shows).length === 0) return legacy;
  return tags([saysItAll(own) ? '' : noun(e), lookTags(shows, family), legacy]);
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
  /** Who the player's brief names, when `brief` is a helper's line: only they may borrow a portrait's seed. */
  named?: readonly Character[] | undefined;
  /** Pose, action, expression and view the helper read from the last passage; after the brief's own tags. */
  storyTags?: readonly string[] | undefined;
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
 * drops, in order: the pose tags read from the story, the body parts named only in identities, the second character's looks, the state, the weather, the first character's looks one key
 * at a time (`KEY_PRIORITY` from the end), then cuts at a comma.
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
  // Every entity's name goes, shown or not.
  const story = unnamed(view.brief, entities);
  const held = (e: Character) => (e.holds ?? []).flatMap((id) => entities.filter((x) => x.id === id).map(noun));
  // Out of frame, a posture or a held sword only pulls the camera back.
  const states = frame?.states ?? 'all';
  const state = tags(people.map((e) => stateTags(inFrame(e.states ?? {}, states), states === 'all' ? held(e) : [], family, brief)));
  const build = (keep: readonly number[], withState: boolean, weather: boolean, parts = false, pose = false): Blocks => ({
    subject: tags([frame?.tag, countTag(people.length, family), ...shown.map((e, i) => subject(e, keep[i] ?? 0, family, keys, parts))]),
    state: withState ? state : '',
    story: tags([...view.tags, story, ...(pose ? (input.storyTags ?? []) : [])]),
    scene: tags([placeIn(scene?.location, entities), weather ? scene?.weather : '']),
    style: tags([style]),
  });
  const all = Infinity;
  const budget = budgetFor(family);
  const first = shown[0];
  const n = Object.keys((first?.look !== undefined ? lookKeys(first.look) : first?.looks) ?? {}).length;
  const fewer = Array.from({ length: n }, (_, i) => build([n - 1 - i, 0], false, false));
  const blocks =
    [
      build([all, all], true, true, true, true),
      build([all, all], true, true, true),
      build([all, all], true, true),
      build([all, 0], true, true),
      build([all, 0], false, true),
      build([all, 0], false, false),
      ...fewer,
    ].find((b) => joined(b).length <= budget) ?? build([0, 0], false, false);
  const seed = seedFor(people, input.named ?? namedCast(view.brief, entities));
  return { prompt: cut(joined(blocks), budget), entityIds: shown.map((e) => e.id), ...(seed !== undefined && { seed }), blocks };
}

function cut(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const head = text.slice(0, budget);
  const comma = head.lastIndexOf(',');
  return (comma > 0 ? head.slice(0, comma) : head).trim();
}
