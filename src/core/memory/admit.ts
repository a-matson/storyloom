import type { Bm25Index } from './lexical';

/** Words that carry nothing a value could be backed by, or an ask could be about. [provisional] */
export const STOP = new Set(
  'the and but with that this from have has had was were are his her its their they them she him who what when where which into onto over under than then there here been will would could about after before your you not for how why did does can now ask tell'.split(
    ' ',
  ),
);

/** Distinct content words of the query a document must hold for `admitted`, short of one rare one. [provisional] */
export const ADMIT_HITS = 2;

/** The query terms `admitted` counts. */
export const contentTerms = (query: readonly string[]): string[] => [...new Set(query)].filter((t) => t.length > 2 && !STOP.has(t));

/**
 * Ids of the documents a strict test lets through: ≥ `ADMIT_HITS` distinct content words of the query
 * (not in `STOP`, longer than two letters), or one no more common than the index's median term and not an everyday word.
 * BM25 alone admits a fact on one shared "road" (M12-2). `everyday`: `COMMON_WORDS`, passed in so the list stays out of the start-up chunk.
 */
export function admitted(index: Bm25Index, query: readonly string[], everyday: ReadonlySet<string> = new Set()): Set<string> {
  const terms = contentTerms(query);
  const dfs = [...index.df.values()].toSorted((a, b) => a - b);
  const median = dfs[Math.floor(dfs.length / 2)] ?? 0;
  // A small corpus is mostly words seen once, so "night" was rare there: an everyday word never is.
  // [measured: 2026-10-17-cast-facts-m19-1.json] night, home, other, one admitted 4 of 22 facts
  const rare = (t: string) => (index.df.get(t) ?? 0) <= median && !everyday.has(t);
  return new Set(
    index.docs
      .filter((doc) => {
        const hits = terms.filter((t) => doc.tf.has(t));
        return hits.length >= ADMIT_HITS || hits.some(rare);
      })
      .map((d) => d.id),
  );
}
