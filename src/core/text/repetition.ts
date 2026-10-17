import { tokenise } from '../memory/lexical';

/** Earlier AI outputs a turn's output is checked against. [provisional] */
export const REPEAT_WINDOW = 8;
const MAX_PHRASES = 10;

const grams = (words: string[], n: number) => words.slice(0, Math.max(0, words.length - n + 1)).map((_, i) => words.slice(i, i + n).join(' '));

/** Share of `a`'s word n-grams that also occur in `b`; 0 when `a` has none. */
export function ngramOverlap(a: string, b: string, n: number): number {
  const ours = grams(tokenise(a), n);
  if (!ours.length) return 0;
  const theirs = new Set(grams(tokenise(b), n));
  return ours.filter((g) => theirs.has(g)).length / ours.length;
}

/** Jaccard of the two texts' word n-gram sets; 0 when either has none. */
export function ngramJaccard(a: string, b: string, n: number): number {
  const ours = new Set(grams(tokenise(a), n));
  const theirs = new Set(grams(tokenise(b), n));
  if (!ours.size || !theirs.size) return 0;
  const shared = [...ours].filter((g) => theirs.has(g)).length;
  return shared / (ours.size + theirs.size - shared);
}

/**
 * Word n-grams of `output` already seen in `previous`, merged into maximal runs so one copied
 * sentence reports once, longest first. Lower-cased, punctuation ignored, no stemming.
 */
export function repeatedPhrases(output: string, previous: readonly string[], n = 4): string[] {
  const seen = new Set(previous.flatMap((p) => grams(tokenise(p), n)));
  const words = tokenise(output);
  const hits = grams(words, n).map((g) => seen.has(g));
  const runs = new Set<string>();
  for (let i = 0; i < hits.length; i++) {
    if (!hits[i]) continue;
    let end = i;
    while (hits[end + 1]) end++;
    runs.add(words.slice(i, end + n).join(' '));
    i = end;
  }
  return [...runs].toSorted((a, b) => b.length - a.length).slice(0, MAX_PHRASES);
}
