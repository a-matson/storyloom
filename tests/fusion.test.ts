import { describe, expect, it } from 'vitest';
import { mmr, rrf } from '@core/memory/fusion';

describe('rrf', () => {
  it('puts an item second in both lists above one first in only one', () => {
    expect(
      rrf([
        ['a', 'b'],
        ['c', 'b'],
      ]).map(([id]) => id),
    ).toEqual(['b', 'a', 'c']);
  });
});

describe('mmr', () => {
  // a and a2 are near-duplicates; b is different and scored lower.
  const vec: Record<string, number[]> = { a: [1, 0], a2: [0.99, 0.1], b: [0, 1] };
  const sim = (x: string, y: string) => {
    const [p, q] = [vec[x] ?? [], vec[y] ?? []];
    return (p[0] ?? 0) * (q[0] ?? 0) + (p[1] ?? 0) * (q[1] ?? 0);
  };
  const ranked = [
    { item: 'a', score: 1 },
    { item: 'a2', score: 0.95 },
    { item: 'b', score: 0.8 },
  ];

  it('drops a near-duplicate below a lower-scored but different candidate', () => {
    expect(mmr(ranked, sim).map((r) => r.item)).toEqual(['a', 'b', 'a2']);
  });

  it('keeps relevance order at lambda 1', () => {
    expect(mmr(ranked, sim, 1).map((r) => r.item)).toEqual(['a', 'a2', 'b']);
  });
});
