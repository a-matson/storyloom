/**
 * BM25 over memories and facts, so a named entity the embedder blurs ("Tamsin" vs "Morrow") still
 * ranks. No stemming and no stop words: proper names are the point, and IDF already discounts "the".
 * Rebuilt per turn: ≤ ~800 short texts, and a cached index would need invalidating on every edit.
 */

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
