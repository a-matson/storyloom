/** Viewpoint phrases in a brief and the view tags they become; the first match per row wins. [provisional] */
const VIEWS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:facing you|towards you|to you|at you)\b/i, 'looking at viewer, front view'],
  [/\b(?:from behind|from the back|behind)\b/i, 'from behind'],
  [/\b(?:from above|looking down at)\b/i, 'from above'],
  [/\b(?:from below|looking up at)\b/i, 'from below'],
  [/\b(?:up close|close-up|close)\b/i, 'close-up'],
];

/** The player is never drawn: a standalone "you" is the camera, not a figure. */
const YOU_WORDS = /\b(?:you|your|yours|yourself)\b/gi;

/** A brief that says "you", before `viewOf` takes the word out. */
export const saysYou = (brief: string): boolean => new RegExp(YOU_WORDS.source, 'i').test(brief);

/** The view tags a brief's viewpoint words ask for, and the brief without them or any "you". */
export function viewOf(brief: string): { tags: string[]; brief: string } {
  const found: string[] = [];
  let rest = brief;
  for (const [re, tag] of VIEWS)
    if (re.test(rest)) {
      found.push(tag);
      rest = rest.replace(re, ' ');
    }
  if (found.length === 0 && !saysYou(brief)) return { tags: [], brief };
  const clean = rest
    .replace(YOU_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '');
  return { tags: found, brief: clean };
}
