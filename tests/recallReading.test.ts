import { describe, expect, it } from 'vitest';
import { FACTS, type SeededFact } from '../bench/recall';
import { earlyFacts, readDepth, type BankMemory, type ProbeRow } from '../bench/recallReading';

const canon: SeededFact = {
  id: 'c',
  class: 'canon',
  plant: ['card', 'The bell tower is black iron.'],
  probe: ['Do', 'look at the tower'],
  statement: 'The bell tower is black iron.',
  expect: ['black iron'],
  contradict: [],
};
const probe = (memoryIds: string[], over: Partial<ProbeRow> = {}): ProbeRow => ({
  id: 'c',
  verdict: 'absent',
  retrieved: false,
  memoryIds,
  sections: {},
  ...over,
});

describe('readDepth', () => {
  const mems: BankMemory[] = [
    { id: 'a', text: 'a', embedding: [1, 0] },
    { id: 'b', text: 'b', embedding: [0.95, Math.sqrt(1 - 0.95 ** 2)] },
    { id: 'c', text: 'c', embedding: [0.5, Math.sqrt(1 - 0.5 ** 2)] },
  ];

  it('counts a retrieved pair at cosine 0.95 as a duplicate, not one at 0.5', () => {
    expect(readDepth(mems, [probe(['a', 'b'])], [], 0).duplicates).toBe(1);
    expect(readDepth(mems, [probe(['a', 'c'])], [], 0).duplicates).toBe(0);
  });

  it('finds a canon fact held only by a forgotten memory', () => {
    const forgotten = { id: 'f', text: 'The tower of black iron rang.', forgotten: true };
    expect(readDepth([forgotten], [], [canon], 0).canonEvicted).toEqual(['c']);
    expect(readDepth([forgotten, { id: 'g', text: 'black iron again' }], [], [canon], 0).canonEvicted).toEqual([]);
  });

  it('reads honoured per retrieved as 0 with nothing retrieved', () => {
    expect(readDepth([], [probe([])], [], 0).honouredPerRetrieved).toBe(0);
    expect(readDepth([], [probe([], { retrieved: true, verdict: 'honoured' }), probe([], { retrieved: true })], [], 0).honouredPerRetrieved).toBe(0.5);
  });

  it('takes the largest structured total over the probes', () => {
    expect(readDepth([], [probe([], { sections: { scene: 20, cast: 30, history: 900 } }), probe([], { sections: { rules: 10 } })], [], 0).structuredMax).toBe(
      50,
    );
  });
});

describe('earlyFacts', () => {
  it('is the four plants before the first filler', () => {
    const planted = FACTS.filter((f) => f.plant[0] === 'Do' || f.plant[0] === 'Say');
    expect([...earlyFacts(FACTS)]).toEqual(planted.slice(0, 4).map((f) => f.id));
  });
});
