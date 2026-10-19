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

/** Each maximal run of consecutive n-grams that `hit` as one phrase. */
function runs(words: string[], n: number, hit: (gram: string) => boolean): string[] {
  const hits = grams(words, n).map(hit);
  const out: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    if (!hits[i]) continue;
    let end = i;
    while (hits[end + 1]) end++;
    out.push(words.slice(i, end + n).join(' '));
    i = end;
  }
  return out;
}

const longestFirst = (phrases: string[]) => [...new Set(phrases)].toSorted((a, b) => b.length - a.length).slice(0, MAX_PHRASES);

/**
 * Word n-grams of `output` already seen in `previous`, merged into maximal runs so one copied
 * sentence reports once, longest first. Lower-cased, punctuation ignored, no stemming.
 */
export function repeatedPhrases(output: string, previous: readonly string[], n = 4): string[] {
  const seen = new Set(previous.flatMap((p) => grams(tokenise(p), n)));
  return longestFirst(runs(tokenise(output), n, (g) => seen.has(g)));
}

/** Recent AI outputs phrase fatigue looks at. [provisional] */
export const FATIGUE_WINDOW = 10;

/** The model's tics: n-gram runs found in at least `min` [provisional] of `outputs`, longest first. */
export function fatiguedPhrases(outputs: readonly string[], min = 3, n = 4): string[] {
  const texts = outputs.map(tokenise);
  const counts = new Map<string, number>();
  for (const words of texts) for (const g of new Set(grams(words, n))) counts.set(g, (counts.get(g) ?? 0) + 1);
  return longestFirst(texts.flatMap((words) => runs(words, n, (g) => (counts.get(g) ?? 0) >= min)));
}
