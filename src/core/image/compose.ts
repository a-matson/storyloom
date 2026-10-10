import type { Entity, Scene } from '../model/types';

/**
 * A See input is a brief: what the picture shows. The prompt sent to the image server is composed
 * from it, the scene and the cast's looks, so character names never reach the server (SD 1.5 does
 * not know who "Tamsin" is; a name only adds noise).
 */

/** SD 1.5 blends attributes once a prompt holds more than two people. [provisional] */
export const CAST_CAP = 2;
/** CLIP reads 75 tokens; ~4 characters a token. [provisional] */
export const PROMPT_BUDGET = 300;

type Character = Pick<Entity, 'id' | 'kind' | 'name' | 'aliases' | 'description' | 'appearance'>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = (n: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.trim())}(?![\\p{L}\\p{N}])`, 'giu');
const namesOf = (e: Character) => [e.name, ...e.aliases].filter((n) => n.trim() !== '');

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
  const first = e.description.split(/[,.;:\n]/)[0] ?? '';
  const lead = new RegExp(`^\\s*(?:${namesOf(e).map(escape).join('|')})\\s+(?:is|was)\\s+`, 'i');
  const n = first.replace(lead, '').trim();
  // "A young scribe." opens a sentence; mid-prompt it is a tag.
  return n && !namesOf(e).some((x) => nameRe(x).test(n)) ? n.replace(/^A(n)? /, (a) => a.toLowerCase()) : 'a person';
}

const looks = (e: Character, full: boolean) => [noun(e), full ? e.appearance?.trim() : ''].filter(Boolean).join(', ');
/** A character's look without their name, for the helper prompt. */
export const looksOf = (e: Character): string => looks(e, true);

/** Comma-separated tags, trimmed and deduped (case-insensitive), empties dropped. */
function tags(parts: readonly (string | undefined)[]): string {
  const unique = new Map<string, string>();
  for (const p of parts)
    for (const t of (p ?? '').split(',').map((x) => x.replace(/\s+/g, ' ').trim()))
      if (t !== '' && !unique.has(t.toLowerCase())) unique.set(t.toLowerCase(), t);
  return [...unique.values()].join(', ');
}

export interface ComposeInput {
  brief: string;
  /** Undefined for a helper-written line: the helper already saw the scene and the looks. */
  scene?: Scene | undefined;
  entities: readonly Character[];
  style: string;
}

/**
 * `brief (names → looks), looks of present-but-unnamed cast, location, weather, style`. Over budget it
 * drops, in order: the second character's looks, the weather, the first character's looks, then cuts at a comma.
 */
export function composeSeePrompt({ brief, scene, entities, style }: ComposeInput): { prompt: string; entityIds: string[] } {
  const cast = castIn(brief, scene, entities);
  const build = (full: readonly boolean[], weather: boolean) => {
    let text = brief;
    const unnamed: string[] = [];
    cast.forEach((e, i) => {
      const before = text;
      for (const n of namesOf(e).toSorted((a, b) => b.length - a.length)) text = text.replace(nameRe(n), () => looks(e, full[i] ?? false));
      if (text === before && i < CAST_CAP) unnamed.push(looks(e, full[i] ?? false));
    });
    return tags([text, ...unnamed, scene?.location, weather ? scene?.weather : '', style]);
  };
  const tries = [build([true, true], true), build([true, false], true), build([true, false], false), build([false, false], false)];
  const fit = tries.find((t) => t.length <= PROMPT_BUDGET);
  return { prompt: fit ?? cut(tries.at(-1) ?? ''), entityIds: cast.slice(0, CAST_CAP).map((e) => e.id) };
}

function cut(text: string): string {
  const head = text.slice(0, PROMPT_BUDGET);
  const comma = head.lastIndexOf(',');
  return (comma > 0 ? head.slice(0, comma) : head).trim();
}
