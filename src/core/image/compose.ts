import type { Entity, Scene } from '../model/types';
import { seedOf } from '../trace';
import type { SheetFamily } from './sheet';
import { countTag, lookTags, tags } from './tags';

/**
 * A See input is a brief: what the picture shows. The prompt sent to the image server is composed
 * from it, the scene and the cast's looks, so character names never reach the server (SD 1.5 does
 * not know who "Tamsin" is; a name only adds noise).
 */

/** SD 1.5 blends attributes once a prompt holds more than two people. [provisional] */
export const CAST_CAP = 2;
/** CLIP reads 75 tokens; ~4 characters a token. [provisional] */
export const PROMPT_BUDGET = 300;

/** `description`, `appearance` and `looks` as `withLooks` resolves them from the assertions. */
type Character = Pick<Entity, 'id' | 'kind' | 'name' | 'aliases' | 'description' | 'look'> & {
  appearance?: string;
  looks?: Readonly<Record<string, string>>;
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

/** Characters `text` names as whole words, in order of first mention; a longer name wins an overlap ("Lena Morrow" over "Lena"). */
export function namedCast<E extends Character>(text: string, entities: readonly E[]): E[] {
  const hits = entities
    .filter((e) => e.kind === 'character')
    .flatMap((e) => namesOf(e).flatMap((n) => [...text.matchAll(nameRe(n))].map((m) => ({ e, at: m.index, end: m.index + m[0].length }))))
    .toSorted((a, b) => b.end - b.at - (a.end - a.at));
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.some((k) => h.at < k.end && k.at < h.end)) kept.push(h);
  return [...new Set(kept.toSorted((a, b) => a.at - b.at).map((h) => h.e))];
}

/** Who the picture shows: every character the brief names, else the scene's present ones. Only the first `CAST_CAP` get their looks. */
export function castIn<E extends Character>(brief: string, scene: Scene | undefined, entities: readonly E[]): E[] {
  const named = namedCast(brief, entities);
  return named.length ? named : [...new Set((scene?.present ?? []).flatMap((p) => namedCast(p, entities).slice(0, 1)))];
}

/** A brief that points at someone without naming them: the helper model resolves "she" from the story. [provisional] */
export function isImplicit(brief: string, named: readonly unknown[]): boolean {
  return named.length === 0 && (brief.match(/,/g)?.length ?? 0) < 4 && /\b(she|he|they|her|him|it)\b/i.test(brief);
}

/** What a character is, without their name: "Tamsin is a ferrywoman who…" → "a ferrywoman". */
function noun(e: Character): string {
  // Not `:`: a "species: dragon" description would yield the noun "species".
  const first = e.description.split(/[,.;\n]/)[0] ?? '';
  const lead = new RegExp(`^\\s*(?:${namesOf(e).map(escape).join('|')})\\s+(?:is|was)\\s+`, 'i');
  const n = first.replace(lead, '').trim();
  // "A young scribe." opens a sentence; mid-prompt it is a tag.
  return n && !namesOf(e).some((x) => nameRe(x).test(n)) ? n.replace(/^A(n)? /, (a) => a.toLowerCase()) : 'a person';
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

/** One character in the subject block: the frozen look verbatim, else the noun and the looks as tags; with `full` off, the noun. */
function subject(e: Character, full: boolean, family: SheetFamily): string {
  if (!full) return noun(e);
  if (e.look !== undefined) return e.look;
  if (!e.looks || Object.keys(e.looks).length === 0) return looks(e, true);
  return tags([saysItAll(e.looks) ? '' : noun(e), lookTags(e.looks, family)]);
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

/**
 * `count, subject (each shown character's looks), state, brief (names → nouns), location, weather, style`.
 * Looks never enter the brief: spliced in, their last tag fused with the verb after it. Over budget it
 * drops, in order: the second character's looks, the weather, the first character's looks, then cuts at a comma.
 */
export function composeSeePrompt(input: ComposeInput): { prompt: string; entityIds: string[]; seed?: number; blocks: Blocks } {
  const { brief, scene, entities, style, family } = input;
  const shown = (input.cast ?? castIn(brief, scene, entities)).slice(0, CAST_CAP);
  // Every character's name goes, shown or not; a possessive goes with it ("Bram's hat" → "a toll keeper hat").
  const story = namedCast(brief, entities).reduce((t, e) => t.replace(mentionRe(e), () => noun(e)), brief);
  const build = (full: readonly boolean[], weather: boolean): Blocks => ({
    subject: tags([countTag(shown.length, family), ...shown.map((e, i) => subject(e, full[i] ?? false, family))]),
    state: '',
    story: tags([story]),
    scene: tags([scene?.location, weather ? scene?.weather : '']),
    style: tags([style]),
  });
  const last = build([false, false], false);
  const blocks = [build([true, true], true), build([true, false], true), build([true, false], false)].find((b) => joined(b).length <= PROMPT_BUDGET) ?? last;
  const seed = seedFor(shown);
  return { prompt: cut(joined(blocks)), entityIds: shown.map((e) => e.id), ...(seed !== undefined && { seed }), blocks };
}

function cut(text: string): string {
  if (text.length <= PROMPT_BUDGET) return text;
  const head = text.slice(0, PROMPT_BUDGET);
  const comma = head.lastIndexOf(',');
  return (comma > 0 ? head.slice(0, comma) : head).trim();
}
