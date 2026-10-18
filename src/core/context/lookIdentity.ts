import { visibleFrom } from '../memory/bodyPlan';
import { speciesIn } from '../memory/species';
import { COLOUR_WORDS } from '../memory/tagify';

/** Words that make a body clause a size. [provisional] */
const SIZE = /\d|\b(?:tall|huge|large|giant|massive|small|tiny)\b/i;
/** A `species` look that names a person, not a kind of creature. [provisional] */
const PERSON = /^(?:a |an )?(?:man|woman|person|boy|girl|child|lady|gentleman)$/i;
/** Words each part keeps: two features stay within `IDENTITY_WORDS` after the species. [provisional] */
const PART_WORDS = 3;

const words = (s: string, n = PART_WORDS) => s.trim().split(/\s+/).filter(Boolean).slice(0, n).join(' ');
const colourIn = (s = '') =>
  s
    .split(/[^\p{L}]+/u)
    .find((w) => COLOUR_WORDS.includes(w.toLowerCase()))
    ?.toLowerCase();

/**
 * A non-human character's identity from its looks: `<size> <colour> <species>, <feature>, <feature>`
 * ("7 meters tall burgundy dragon, 2 black horns, deep green eyes"), so the prose writes the body the
 * player built. Undefined for no `species` look or a human one: their identity stays the card's words.
 */
export function lookIdentity(looks: Readonly<Record<string, string>>): string | undefined {
  const species = looks['species']?.trim();
  if (!species || speciesIn(species) === 'human' || PERSON.test(species)) return undefined;
  const body = [looks['body'], looks['build']].filter((s) => s !== undefined).join(', ');
  const size = body.split(',').find((c) => SIZE.test(c));
  const colour = colourIn(looks['skin']) ?? colourIn(looks['scales']) ?? colourIn(looks['palette']);
  const eyes = looks['eyes']?.trim();
  const named = [looks['horns']?.trim(), eyes && (/\beyes?\b/i.test(eyes) ? eyes : `${words(eyes, PART_WORDS - 1)} eyes`)].filter((f): f is string => !!f);
  // A body word the horns or eyes already name is not said twice.
  const parts = visibleFrom(body).filter((v) => !named.some((f) => f.toLowerCase().includes(v.replace(/s$/, ''))));
  // The last words: "six long curved black horns" keeps its noun.
  const features = [...named, ...parts].slice(0, 2).map((f) => f.split(/\s+/).slice(-PART_WORDS).join(' '));
  const head = [size && words(size), colour, words(species)].filter((p) => !!p).join(' ');
  return [head, ...features].join(', ');
}
