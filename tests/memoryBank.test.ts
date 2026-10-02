import { describe, expect, it } from 'vitest';
import { cosine, dueMemoryRanges, evictToSize, markStale, rankMemories, summaryDue } from '@core/memory/memoryBank';
import type { Memory } from '@core/model/types';

const mem = (id: string, from: number, useCount = 0, createdAt = 0, embedding?: number[]): Memory => ({
  id,
  text: id,
  fromAction: from,
  toAction: from + 6,
  actionIds: [`a${from}`],
  useCount,
  createdAt,
  embedding,
});

describe('memory scheduling', () => {
  it('writes the first memory at 12 actions and one more every 6', () => {
    expect(dueMemoryRanges(11, [])).toEqual([]);
    expect(dueMemoryRanges(12, [])).toEqual([{ fromAction: 0, toAction: 6 }]);
    expect(dueMemoryRanges(17, [mem('m0', 0)])).toEqual([]);
    expect(dueMemoryRanges(18, [mem('m0', 0)])).toEqual([{ fromAction: 6, toAction: 12 }]);
    // catching up an adventure that had the feature off
    expect(dueMemoryRanges(30, [])).toHaveLength(4);
  });

  it('refreshes the summary every 15 actions', () => {
    expect(summaryDue(14, 0)).toBe(false);
    expect(summaryDue(15, 0)).toBe(true);
    expect(summaryDue(29, 15)).toBe(false);
    expect(summaryDue(30, 15)).toBe(true);
  });
});

describe('retrieval and eviction', () => {
  it('ranks by cosine similarity and skips stale memories', () => {
    const a = mem('a', 0, 0, 0, [1, 0]);
    const b = mem('b', 6, 0, 1, [0, 1]);
    const c = { ...mem('c', 12, 0, 2, [1, 0]), stale: true };
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(rankMemories([a, b, c], [1, 0]).map((r) => r.memory.id)).toEqual(['a', 'b']);
  });

  it('forgets the least-used, then oldest, memories', () => {
    const memories = [mem('old-unused', 0, 0, 0), mem('new-unused', 6, 0, 5), mem('used', 12, 3, 1)];
    const { kept, forgotten } = evictToSize(memories, 2);
    expect(forgotten.map((m) => m.id)).toEqual(['old-unused']);
    expect(kept.map((m) => m.id)).toEqual(['new-unused', 'used']);
  });

  it('marks memories stale when their actions change', () => {
    const out = markStale([mem('a', 0), mem('b', 6)], new Set(['a6']));
    expect(out.map((m) => !!m.stale)).toEqual([false, true]);
  });
});
