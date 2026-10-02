import { describe, expect, it } from 'vitest';
import { cosine, dueMemoryRanges, evictToSize, markStale, rankMemories, summaryDue } from '@core/memory/memoryBank';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { createBlankAdventure } from '@core/model';
import type { Memory } from '@core/model/types';
import type { Embedder, Provider } from '@core/ports';

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

  it('forgets the least-used, then oldest, memories but keeps them flagged', () => {
    const memories = [mem('old-unused', 0, 0, 0), mem('new-unused', 6, 0, 5), mem('used', 12, 3, 1)];
    const out = evictToSize(memories, 2);
    expect(out.forgotten).toBe(1);
    expect(out.memories.map((m) => [m.id, !!m.forgotten])).toEqual([
      ['old-unused', true],
      ['new-unused', false],
      ['used', false],
    ]);
    expect(evictToSize(out.memories, 2)).toEqual({ memories: out.memories, forgotten: 0 });
  });

  it('does not summarise a forgotten range again', () => {
    const { memories } = evictToSize([mem('a', 0, 0, 0), mem('b', 6, 1, 1)], 1);
    expect(dueMemoryRanges(18, memories)).toEqual([]);
    // the cap may drop old forgotten memories; their ranges still precede the newest one
    expect(dueMemoryRanges(18, [mem('b', 6)])).toEqual([]);
  });

  it('leaves forgotten memories out of ranking and the bank count', () => {
    const f = { ...mem('f', 0, 0, 9, [1, 0]), forgotten: true };
    const a = mem('a', 6, 0, 1, [0, 1]);
    expect(rankMemories([f, a], [1, 0]).map((r) => r.memory.id)).toEqual(['a']);
    expect(evictToSize([f, a], 1).forgotten).toBe(0);
  });

  it('keeps at most bankSize forgotten memories, dropping the oldest', () => {
    const memories = [0, 1, 2, 3].map((i) => ({ ...mem(`f${i}`, i * 6, 0, i), forgotten: true }));
    expect(evictToSize([...memories, mem('a', 24, 0, 9)], 2).memories.map((m) => m.id)).toEqual(['f2', 'f3', 'a']);
  });

  it('marks memories stale when their actions change', () => {
    const out = markStale([mem('a', 0), mem('b', 6)], new Set(['a6']));
    expect(out.map((m) => !!m.stale)).toEqual([false, true]);
  });
});

describe('embedder changes', () => {
  it('ignores vectors from another embedder when ranking', () => {
    const old = mem('old', 0, 0, 9, [1, 0, 0]);
    const cur = mem('cur', 6, 0, 1, [0, 1]);
    expect(rankMemories([old, cur], [0, 1]).map((r) => [r.memory.id, r.score])).toEqual([
      ['cur', 1],
      ['old', 0],
    ]);
  });

  it('re-embeds memories whose vectors came from another embedder', async () => {
    const adventure = createBlankAdventure('T', 'Start.');
    adventure.settings.memory.memoryBank = true;
    adventure.memories = [mem('old', 0, 0, 0, [1, 0, 0]), mem('none', 6), { ...mem('stale', 12, 0, 0, [1]), stale: true }, mem('ok', 18, 0, 0, [0, 1])];
    const embedded: string[] = [];
    const embedder: Embedder = {
      id: 'new',
      dimensions: 2,
      embed: (texts) => {
        embedded.push(...texts);
        return Promise.resolve(texts.map(() => [1, 0]));
      },
    };
    const provider = { id: 'p' } as unknown as Provider; // nothing is due, so it is never called
    await runMemoryMaintenance(adventure, { provider, embedder, template: adventure.settings.template });
    expect(embedded).toEqual(['old', 'none']);
    // the stale memory's actions do not exist here, so it is dropped rather than re-embedded
    expect(adventure.memories.map((m) => m.embedding)).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
  });

  it('waits for the embedder to report its dimensions', async () => {
    const adventure = createBlankAdventure('T', 'Start.');
    adventure.memories = [mem('old', 0, 0, 0, [1, 0, 0])];
    const embedder: Embedder = { id: 'new', dimensions: 0, embed: () => Promise.reject(new Error('not called')) };
    await runMemoryMaintenance(adventure, { provider: { id: 'p' } as unknown as Provider, embedder, template: adventure.settings.template });
    expect(adventure.memories[0]?.embedding).toEqual([1, 0, 0]);
  });
});
