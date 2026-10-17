/**
 * BM25 over memories and facts, so a named entity the embedder blurs ("Tamsin" vs "Morrow") still
 * ranks. No stemming and no stop words: proper names are the point, and IDF already discounts "the".
 * Rebuilt per turn: ≤ ~800 short texts, and a cached index would need invalidating on every edit.
 */

import { COMMON_WORDS } from './commonWords';

/** Words that carry nothing a value could be backed by, or an ask could be about. [provisional] */
export const STOP = new Set(
  'the and but with that this from have has had was were are his her its their they them she him who what when where which into onto over under than then there here been will would could about after before your you not for how why did does can now ask tell'.split(
    ' ',
  ),
);

/** Distinct content words of the query a document must hold for `admitted`, short of one rare one. [provisional] */
export const ADMIT_HITS = 2;

/** [provisional] the standard pair */
export const BM25_K1 = 1.2;
/** [provisional] */
export const BM25_B = 0.75;

export interface Bm25Index {
  docs: { id: string; tf: Map<string, number>; length: number }[];
  df: Map<string, number>;
  avgLength: number;
}

export const tokenise = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export function buildIndex(corpus: readonly { id: string; text: string }[]): Bm25Index {
  const df = new Map<string, number>();
  let total = 0;
  const docs = corpus.map(({ id, text }) => {
    const terms = tokenise(text);
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    total += terms.length;
    return { id, tf, length: terms.length };
  });
  return { docs, df, avgLength: total / (docs.length || 1) };
}

/** Ids of the documents sharing a term with the query, best first. */
export function bm25(index: Bm25Index, query: readonly string[]): string[] {
  const n = index.docs.length;
  const idf = [...new Set(query)].map((t) => {
    const d = index.df.get(t) ?? 0;
    return [t, Math.log(1 + (n - d + 0.5) / (d + 0.5))] as const;
  });
  return index.docs
    .map((doc) => {
      const norm = BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / (index.avgLength || 1));
      let score = 0;
      for (const [t, w] of idf) {
        const f = doc.tf.get(t) ?? 0;
        if (f > 0) score += (w * f * (BM25_K1 + 1)) / (f + norm);
      }
      return { id: doc.id, score };
    })
    .filter((d) => d.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .map((d) => d.id);
}

/** The query terms `admitted` counts. */
export const contentTerms = (query: readonly string[]): string[] => [...new Set(query)].filter((t) => t.length > 2 && !STOP.has(t));

/**
 * Ids of the documents a strict test lets through: ≥ `ADMIT_HITS` distinct content words of the query
 * (not in `STOP`, longer than two letters), or one no more common than the index's median term and not an everyday word.
 * BM25 alone admits a fact on one shared "road" (M12-2).
 */
export function admitted(index: Bm25Index, query: readonly string[]): Set<string> {
  const terms = contentTerms(query);
  const dfs = [...index.df.values()].toSorted((a, b) => a - b);
  const median = dfs[Math.floor(dfs.length / 2)] ?? 0;
  // A small corpus is mostly words seen once, so "night" was rare there: an everyday word never is.
  // [measured: 2026-10-17-cast-facts-m19-1.json] night, home, other, one admitted 4 of 22 facts
  const rare = (t: string) => (index.df.get(t) ?? 0) <= median && !COMMON_WORDS.has(t);
  return new Set(
    index.docs
      .filter((doc) => {
        const hits = terms.filter((t) => doc.tf.has(t));
        return hits.length >= ADMIT_HITS || hits.some(rare);
      })
      .map((d) => d.id),
  );
}
