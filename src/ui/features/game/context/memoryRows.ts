import type { RankedMemory } from '@core/memory';
import type { Memory } from '@core/model';

export type MemoryStatus = 'used' | 'stored' | 'stale' | 'forgotten';

export interface MemoryRow {
  memory: Memory;
  status: MemoryStatus;
  /** Relevance to the last prompt's query; undefined when the memory was not ranked. */
  score: number | undefined;
  rank: number;
}

const ORDER: MemoryStatus[] = ['used', 'stored', 'stale', 'forgotten'];

/** Bank memories against the last prompt. `used` wins so the count matches the Budget tab's "N retrieved". */
export function classifyMemories(memories: Memory[], used: Memory[], ranked: RankedMemory[]): MemoryRow[] {
  const usedIds = new Set(used.map((m) => m.id));
  const ranks = new Map(ranked.map((r, i) => [r.memory.id, { rank: i, score: r.score }]));
  return memories.map((memory) => {
    const r = ranks.get(memory.id);
    const status: MemoryStatus = usedIds.has(memory.id) ? 'used' : memory.forgotten ? 'forgotten' : memory.stale ? 'stale' : 'stored';
    return { memory, status, score: r?.score, rank: r?.rank ?? Infinity };
  });
}

export const byTimeline = (rows: MemoryRow[]): MemoryRow[] => rows.toSorted((a, b) => a.memory.fromAction - b.memory.fromAction);

export const byRelevance = (rows: MemoryRow[]): MemoryRow[] =>
  rows.toSorted((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.rank - b.rank || a.memory.fromAction - b.memory.fromAction);

export function countByStatus(rows: MemoryRow[]): Record<MemoryStatus, number> {
  const counts = { used: 0, stored: 0, stale: 0, forgotten: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}
