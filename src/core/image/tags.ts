import { VISIBLE_WORDS } from '../memory/bodyPlan';
import { tag } from '../memory/looks';
import type { SheetFamily } from './sheet';

/** Booru checkpoints read "<colour> eyes", not "eyes: <colour>". [provisional] */
const NOUN_AFTER = new Set<string>(['eyes', 'scales', 'hair', 'skin', ...VISIBLE_WORDS]);
/** Subject tags in booru order: the body plan, what the body is, its covering, features and clothes, then parts the identity names. [provisional] */
const ORDER = ['body', 'species', 'build', 'skin', 'scales', 'hair', 'eyes', 'horns', 'face', 'marks', 'wearing', 'accessories', 'palette', ...VISIBLE_WORDS];

/** One look as the family spells it: SDXL booru tags, SD 1.5 the `key: value` it always had; a body plan is bare on both. */
export function booruTag(key: string, value: string, family: SheetFamily): string {
  // Booru tags a four-legged animal `feral` as well. [provisional]
  if (key === 'body') return family === 'sdxl' && /^quadruped$/i.test(value) ? 'feral, quadruped' : value;
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

/** Words that show a place: buildings, land, water, material and colour. [provisional] */
const VISUAL =
  /\b(?:keep|castle|fort|fortress|tower|wall|gate|hall|house|hut|cottage|inn|tavern|temple|shrine|chapel|ruin|bridge|road|street|alley|market|square|village|town|city|port|harbou?r|dock|jetty|pier|mill|farm|field|meadow|forest|wood|grove|swamp|marsh|bog|river|stream|lake|sea|shore|beach|coast|cliff|hill|mountain|peak|valley|canyon|cave|cavern|desert|dune|island|plain|glacier|waterfall|garden|courtyard|cellar|dungeon|crypt|tomb|library|chamber|room|camp|tent|ship|stone|wooden|iron|brick|marble|granite|timber|thatched|glass|golden|silver|black|white|red|green|blue|grey|gray|brown|dark|ruined|snowy|misty|crumbling)(?:e?s)?\b/i;
/** Past six words a place is a sentence, not a tag. [provisional] */
const PLACE_WORDS = 6;

/**
 * A place as it looks: the first clause of its description holding a visual word, without the
 * "Halven is" lead or an article. A capital past the first letter is a proper noun, so that clause never goes.
 */
export function placeTag(description: string): string {
  for (const clause of description.split(/[,.;\n]/)) {
    const t = clause
      .replace(/^\s*\p{Lu}\S*(?:\s+\p{Lu}\S*)*\s+(?:is|was)\s+/u, '')
      .replace(/^\s*(?:an?|the)\s+/i, '')
      .trim();
    if (t.split(/\s+/).length <= PLACE_WORDS && VISUAL.test(t) && !/\p{Lu}/u.test(t.slice(1))) return t.toLowerCase();
  }
  return '';
}
