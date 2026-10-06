/** [provisional] the usual constant; damps the head of each list so no single ranking dominates */
export const RRF_K = 60;
/** [provisional] relevance vs diversity in `mmr`; 1 is pure relevance */
export const MMR_LAMBDA = 0.7;

/**
 * Reciprocal rank fusion: each id scores Σ 1/(k + rank) over the lists it is in, best first.
 * Rank-based, so cosine and BM25 scores need no calibration against each other.
 */
export function rrf(rankings: readonly (readonly string[])[], k = RRF_K): [id: string, score: number][] {
  const scores = new Map<string, number>();
  for (const list of rankings) list.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...scores].toSorted((a, b) => b[1] - a[1]);
}

/**
 * Maximal marginal relevance: reorder so each pick trades its score (scaled to the best) against its
 * likeness to what is already picked. O(n³) in `sim` calls, so callers pass a short head.
 */
export function mmr<T>(ranked: readonly { item: T; score: number }[], sim: (a: T, b: T) => number, lambda = MMR_LAMBDA): { item: T; score: number }[] {
  const top = ranked[0]?.score ?? 0;
  const scale = top > 0 ? top : 1;
  const left = [...ranked];
  const picked: typeof left = [];
  while (left.length) {
    let best = 0;
    let bestValue = -Infinity;
    left.forEach((c, i) => {
      const value = (lambda * c.score) / scale - (1 - lambda) * Math.max(0, ...picked.map((p) => sim(p.item, c.item)));
      if (value > bestValue) [best, bestValue] = [i, value];
    });
    picked.push(...left.splice(best, 1));
  }
  return picked;
}
