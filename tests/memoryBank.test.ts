import { describe, expect, it } from 'vitest';
import {
  actionsUntilMemory,
  cosine,
  dueMemoryRanges,
  entitiesOverdue,
  evictToSize,
  markStale,
  MEMORY_SPAN,
  memoryOverdue,
  MMR_POOL,
  rankMemories,
  summaryDue,
  summaryOverdue,
} from '@core/memory/memoryBank';
import { bm25, buildIndex, tokenise } from '@core/memory/lexical';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { createBlankAdventure } from '@core/model';
import type { Action, Memory } from '@core/model/types';
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

/** Log types as in real play: one AI output, then a player action and the AI's reply per turn. */
const playLog = (n: number): Pick<Action, 'type'>[] => Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 'start' : i % 2 ? 'do' : 'continue' }));
const prose = (n: number): Pick<Action, 'type'>[] => Array.from({ length: n }, () => ({ type: 'continue' }));

describe('memory scheduling', () => {
  it('writes the first memory at 12 actions and one more every 6', () => {
    expect(dueMemoryRanges(prose(11), [])).toEqual([]);
    expect(dueMemoryRanges(prose(12), [])).toEqual([{ fromAction: 0, toAction: 6 }]);
    expect(dueMemoryRanges(prose(17), [mem('m0', 0)])).toEqual([]);
    expect(dueMemoryRanges(prose(18), [mem('m0', 0)])).toEqual([{ fromAction: 6, toAction: 12 }]);
    // catching up an adventure that had the feature off
    expect(dueMemoryRanges(prose(30), [])).toHaveLength(4);
  });

  it('ends every range on an AI output; a trailing player action rolls into the next range', () => {
    const log = playLog(30);
    const ranges = dueMemoryRanges(log, []);
    expect(ranges.slice(0, 2)).toEqual([
      { fromAction: 0, toAction: 5 },
      { fromAction: 5, toAction: 11 },
    ]);
    for (const r of ranges) expect(log[r.toAction - 1]?.type).not.toMatch(/do|say/);
    expect(ranges.at(-1)!.toAction).toBeLessThanOrEqual(30 - MEMORY_SPAN);
  });

  it('refreshes the summary once a whole eviction chunk left the history, never before eviction', () => {
    expect(summaryDue(0, 0, 8)).toBe(false);
    expect(summaryDue(7, 0, 8)).toBe(false);
    expect(summaryDue(8, 0, 8)).toBe(true);
    expect(summaryDue(15, 8, 8)).toBe(false);
    expect(summaryDue(16, 8, 8)).toBe(true);
    expect([summaryOverdue(15, 0, 8), summaryOverdue(16, 0, 8), summaryOverdue(23, 8, 8), summaryOverdue(24, 8, 8)]).toEqual([false, true, false, true]);
  });

  it('counts down to the next memory', () => {
    expect(actionsUntilMemory(11, [])).toBe(1);
    expect(actionsUntilMemory(12, [])).toBe(0);
    expect(actionsUntilMemory(13, [mem('m0', 0)])).toBe(5);
    expect(actionsUntilMemory(17, [mem('m0', 0)])).toBe(1);
    expect(actionsUntilMemory(18, [mem('m0', 0)])).toBe(0);
    expect(actionsUntilMemory(30, [mem('m0', 0)])).toBe(0);
  });

  it('calls a memory overdue once it has waited about three turns', () => {
    expect(memoryOverdue(17, [])).toBe(false);
    expect(memoryOverdue(18, [])).toBe(true);
    expect(memoryOverdue(23, [mem('m0', 0)])).toBe(false);
    expect(memoryOverdue(24, [mem('m0', 0)])).toBe(true);
  });

  it('calls entity extraction overdue once three memories wait for it', () => {
    const memories = [mem('m0', 0), mem('m1', 6), mem('m2', 12)];
    expect(entitiesOverdue({ memories: memories.slice(0, 2), scriptState: {} })).toBe(false);
    expect(entitiesOverdue({ memories, scriptState: {} })).toBe(true);
    expect(entitiesOverdue({ memories, scriptState: { __entitiesAt: memories[0]?.toAction ?? 0 } })).toBe(false);
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

  it('fuses a BM25 hit with cosine, so a memory naming the queried character outranks a closer vector', () => {
    const near = { ...mem('near', 0, 0, 0, [1, 0]), text: 'The ferrywoman poled across the dark water.' };
    const named = { ...mem('named', 6, 0, 1, [0.6, 0.8]), text: 'Tamsin hid the pendant under the jetty.' };
    const query = [1, 0];
    expect(rankMemories([near, named], query).map((r) => r.memory.id)).toEqual(['near', 'named']);
    const hits = bm25(buildIndex([near, named]), tokenise('Where did Tamsin go?'));
    expect(rankMemories([near, named], query, Infinity, hits).map((r) => r.memory.id)).toEqual(['named', 'near']);
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
    expect(dueMemoryRanges(prose(18), memories)).toEqual([]);
    // the cap may drop old forgotten memories; their ranges still precede the newest one
    expect(dueMemoryRanges(prose(18), [mem('b', 6)])).toEqual([]);
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

  it('never evicts a pinned memory, even the least-used and oldest', () => {
    const pinned = { ...mem('pinned', 0, 0, 0), pinned: true };
    const out = evictToSize([pinned, mem('b', 6, 1, 1), mem('c', 12, 2, 2)], 1);
    expect(out.forgotten).toBe(2);
    expect(out.memories.find((m) => m.id === 'pinned')?.forgotten).toBeUndefined();
    // a bank of only pinned memories may exceed bankSize
    expect(evictToSize([pinned, { ...mem('p2', 6), pinned: true }], 1).forgotten).toBe(0);
  });

  it('ranks an active pinned memory first, with or without lexical hits', () => {
    const pinned = { ...mem('pinned', 0, 0, 0, [0, 1]), pinned: true };
    const close = mem('close', 6, 0, 1, [1, 0]);
    expect(rankMemories([close, pinned], [1, 0]).map((r) => r.memory.id)).toEqual(['pinned', 'close']);
    expect(rankMemories([close, pinned], [1, 0], 1, ['close']).map((r) => r.memory.id)).toEqual(['pinned']);
  });

  it('does not rank a pinned memory that is forgotten or stale', () => {
    const a = mem('a', 12, 0, 2, [1, 0]);
    const ranked = rankMemories([{ ...mem('f', 0), pinned: true, forgotten: true }, { ...mem('s', 6), pinned: true, stale: true }, a], [1, 0], Infinity, []);
    expect(ranked.map((r) => r.memory.id)).toEqual(['a']);
  });
});

describe('near-duplicate memories', () => {
  const a = mem('a', 0, 0, 0, [1, 0, 0]);
  const twin = mem('twin', 6, 0, 1, [0.99, 0.05, 0]);
  const b = mem('b', 12, 0, 2, [0.6, 0.8, 0]);
  const c = mem('c', 18, 0, 3, [0.5, 0, 0.866]);
  const ids = (ms: Memory[]) => rankMemories(ms, [1, 0, 0], Infinity, []).map((r) => r.memory.id);

  it('moves a memory almost equal to a higher-ranked one behind every distinct memory, leaving their order', () => {
    // More than the MMR head, which only reorders: the twin must leave it.
    const others = Array.from({ length: MMR_POOL + 2 }, (_, i) => {
      const v = Array.from({ length: MMR_POOL + 5 }, (_v, d) => (d === 0 ? 0.5 : d === i + 2 ? 0.866 : 0));
      return mem(`o${i}`, 24 + 6 * i, 0, 10 + i, v);
    });
    const pad = (m: Memory) => ({ ...m, embedding: [...(m.embedding ?? []), ...Array<number>(MMR_POOL + 2).fill(0)] });
    const q = pad(a).embedding;
    const rank = (ms: Memory[]) => rankMemories(ms, q, Infinity, []).map((r) => r.memory.id);
    expect(rank([pad(twin), pad(a), ...others])).toEqual([...rank([pad(a), ...others]), 'twin']);
  });

  it('keeps a pinned near-duplicate in place and moves its unpinned twin instead', () => {
    const ranked = ids([{ ...twin, pinned: true }, a, b, c]);
    expect([ranked[0], ranked.at(-1)]).toEqual(['twin', 'a']);
  });

  it('never treats memories without embeddings or of another dimension as duplicates', () => {
    const short = mem('short', 24, 0, 1, [1, 0]);
    const long = { ...a, createdAt: 9 };
    const bare = (id: string, at: number) => mem(id, at, 0, 5);
    const ranked = rankMemories([bare('x', 30), long, short, bare('y', 36)], [1, 0], Infinity, []).map((r) => r.memory.id);
    expect(ranked).toEqual(['short', 'a', 'x', 'y']);
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
    adventure.scriptState.__entitiesAt = 24;
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
    adventure.scriptState.__entitiesAt = 6;
    const embedder: Embedder = { id: 'new', dimensions: 0, embed: () => Promise.reject(new Error('not called')) };
    await runMemoryMaintenance(adventure, { provider: { id: 'p' } as unknown as Provider, embedder, template: adventure.settings.template });
    expect(adventure.memories[0]?.embedding).toEqual([1, 0, 0]);
  });
});
