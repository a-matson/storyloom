import { tag } from '../memory/looks';
import type { SheetFamily } from './sheet';

/** Booru checkpoints read "<colour> eyes", not "eyes: <colour>". [provisional] */
const NOUN_AFTER = new Set(['eyes', 'scales', 'hair', 'skin', 'horns']);
/** Subject tags in booru order: what the body is, then its covering, then features and clothes. [provisional] */
const ORDER = ['species', 'build', 'skin', 'scales', 'hair', 'eyes', 'horns', 'face', 'marks', 'wearing', 'accessories', 'palette'];

/** One look as the family spells it: SDXL booru tags, SD 1.5 the `key: value` it always had. */
export function booruTag(key: string, value: string, family: SheetFamily): string {
  if (family === 'sd15') return tag(key, value);
  if (NOUN_AFTER.has(key)) return value.toLowerCase().includes(key) ? value : `${value} ${key}`;
  if (key === 'wearing') return /^wearing\b/i.test(value) ? value : `wearing ${value}`;
  return value;
}

/** A character's looks as subject tags, in `ORDER`; keys outside it are not looks. */
export const lookTags = (looks: Readonly<Record<string, string>>, family: SheetFamily): string =>
  ORDER.flatMap((k) => (looks[k]?.trim() ? [booruTag(k, looks[k].trim(), family)] : [])).join(', ');

/** SDXL booru models count the figures; SD 1.5 has no such tag. [provisional] */
export const countTag = (n: number, family: SheetFamily): string => (family === 'sdxl' ? (['', 'solo', 'duo'][n] ?? '') : '');

/** Comma-separated tags, trimmed and deduped (case-insensitive), empties dropped. */
export function tags(parts: readonly (string | undefined)[]): string {
  const unique = new Map<string, string>();
  for (const p of parts)
    for (const t of (p ?? '').split(',').map((x) => x.replace(/\s+/g, ' ').trim()))
      if (t !== '' && !unique.has(t.toLowerCase())) unique.set(t.toLowerCase(), t);
  return [...unique.values()].join(', ');
}
