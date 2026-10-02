import { describe, expect, it } from 'vitest';
import type { Memory } from '@core/model/types';
import { byRelevance, byTimeline, classifyMemories, countByStatus } from '@ui/features/game/context/memoryRows';

const mem = (id: string, from: number, flags: Partial<Memory> = {}): Memory => ({
  id,
  text: id,
  fromAction: from,
  toAction: from + 6,
  actionIds: [],
  useCount: 0,
  createdAt: from,
  ...flags,
});

const bank = [mem('old', 0), mem('stale', 6, { stale: true }), mem('gone', 12, { forgotten: true }), mem('hit', 18), mem('miss', 24)];
const used = [bank[3]!];
const ranked = [
  { memory: bank[4]!, score: 0.9 },
  { memory: bank[3]!, score: 0.8 },
  { memory: bank[0]!, score: 0.1 },
];

describe('memory rows', () => {
  const rows = classifyMemories(bank, used, ranked);

  it('classifies used, stored, stale and forgotten', () => {
    expect(Object.fromEntries(rows.map((r) => [r.memory.id, r.status]))).toEqual({
      old: 'stored',
      stale: 'stale',
      gone: 'forgotten',
      hit: 'used',
      miss: 'stored',
    });
    expect(countByStatus(rows)).toEqual({ used: 1, stored: 2, stale: 1, forgotten: 1 });
    expect(rows.find((r) => r.memory.id === 'hit')?.score).toBe(0.8);
    expect(rows.find((r) => r.memory.id === 'gone')?.score).toBeUndefined();
  });

  it('a used memory stays used even if it went stale since', () => {
    const r = classifyMemories([mem('hit', 0, { stale: true })], used, []);
    expect(r[0]?.status).toBe('used');
  });

  it('relevance: used first, then stored by rank, then stale, then forgotten', () => {
    expect(byRelevance(rows).map((r) => r.memory.id)).toEqual(['hit', 'miss', 'old', 'stale', 'gone']);
  });

  it('timeline: by first action', () => {
    expect(byTimeline(rows.toReversed()).map((r) => r.memory.id)).toEqual(['old', 'stale', 'gone', 'hit', 'miss']);
  });
});
