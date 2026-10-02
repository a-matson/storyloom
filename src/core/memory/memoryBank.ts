import type { Action, Memory } from '../model/types';
import { newId } from '../model/types';

/**
 * Memory Bank: storage, retrieval and scheduling of AI-written memories.
 *
 * A Memory summarises six consecutive actions. Scheduling (AI Dungeon rules):
 *  - the first memory is written once the adventure is 12 actions deep and
 *    covers actions 0–5; the next covers 6–11 once there are 18 actions, and
 *    so on. The most recent six actions are never summarised, so they stay
 *    freely editable.
 *  - the Story Summary is refreshed every 15 actions.
 *
 * Retrieval: memories are embedded; the most recent action is embedded as the
 * query; cosine similarity ranks the bank; the builder takes as many as fit.
 * Memories are only used once the whole history no longer fits the context.
 *
 * Eviction: when the bank is full, the least-used memory (then the oldest) is
 * forgotten: flagged and kept, so its range is not summarised again. Frequently-used
 * old memories can live forever. Edits mark memories stale; the idle job rewrites them.
 */

export const MEMORY_SPAN = 6;
export const MEMORY_LAG = 12;
export const SUMMARY_INTERVAL = 15;

export interface MemoryRange {
  fromAction: number;
  toAction: number;
}

/**
 * Six-action ranges due for summarisation: those after the newest memory. Ranges before it
 * were summarised already, even if that memory has since been dropped from the forgotten pile.
 */
export function dueMemoryRanges(actionCount: number, existing: Pick<Memory, 'toAction'>[]): MemoryRange[] {
  const due: MemoryRange[] = [];
  const start = existing.reduce((n, m) => Math.max(n, m.toAction), 0);
  for (let from = start; from + MEMORY_LAG <= actionCount; from += MEMORY_SPAN) due.push({ fromAction: from, toAction: from + MEMORY_SPAN });
  return due;
}

/** In the bank: neither forgotten nor waiting to be rewritten. */
export const isActive = (m: Memory): boolean => !m.forgotten && !m.stale;

/** Where a stale memory's actions sit now; null when any were erased (the memory is dropped). */
export function currentRange(actions: Action[], m: Memory): MemoryRange | null {
  const from = actions.findIndex((a) => a.id === m.actionIds[0]);
  if (from < 0 || m.actionIds.some((id, i) => actions[from + i]?.id !== id)) return null;
  return { fromAction: from, toAction: from + m.actionIds.length };
}

/** True when the running Story Summary should be refreshed at this count. */
export function summaryDue(actionCount: number, lastSummarisedAt: number): boolean {
  if (actionCount < SUMMARY_INTERVAL) return false;
  return actionCount - lastSummarisedAt >= SUMMARY_INTERVAL;
}

/** Actions until `summaryDue` turns true; 0 when it already is. */
export const actionsUntilSummary = (actionCount: number, lastSummarisedAt: number): number => Math.max(0, lastSummarisedAt + SUMMARY_INTERVAL - actionCount);

/** Actions until `dueMemoryRanges` is non-empty; 0 when a range is already due. */
export function actionsUntilMemory(actionCount: number, existing: Pick<Memory, 'toAction'>[]): number {
  const start = existing.reduce((n, m) => Math.max(n, m.toAction), 0);
  return Math.max(0, start + MEMORY_LAG - actionCount);
}

export function createMemory(text: string, actions: Action[], range: MemoryRange, embedding?: number[]): Memory {
  return {
    id: newId('mem_'),
    text,
    fromAction: range.fromAction,
    toAction: range.toAction,
    actionIds: actions.slice(range.fromAction, range.toAction).map((a) => a.id),
    embedding,
    useCount: 0,
    createdAt: Date.now(),
  };
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RankedMemory {
  memory: Memory;
  score: number;
}

/** Rank the bank by relevance to a query embedding. Brute force is fine for ≤ 800 vectors. */
export function rankMemories(memories: Memory[], query: number[] | undefined, limit = Infinity): RankedMemory[] {
  const ranked: RankedMemory[] = [];
  for (const m of memories) {
    if (!isActive(m)) continue;
    // Vectors from another embedder (other length) are not comparable; they rank by recency until re-embedded.
    const score = query && m.embedding?.length === query.length ? cosine(m.embedding, query) : 0;
    ranked.push({ memory: m, score });
  }
  ranked.sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt);
  return ranked.slice(0, limit);
}

/**
 * Flag the least-used active memories `forgotten` until the bank fits, then drop the oldest
 * forgotten beyond `bankSize` of them ([provisional] cap, bounds storage on long adventures).
 */
export function evictToSize(memories: Memory[], bankSize: number): { memories: Memory[]; forgotten: number } {
  const active = memories.filter(isActive);
  const losers = active.toSorted((a, b) => a.useCount - b.useCount || a.createdAt - b.createdAt).slice(0, Math.max(0, active.length - bankSize));
  const ids = new Set(losers.map((m) => m.id));
  const flagged = memories.map((m) => (ids.has(m.id) ? { ...m, forgotten: true } : m));
  const dropped = new Set(
    flagged
      .filter((m) => m.forgotten)
      .toSorted((a, b) => b.createdAt - a.createdAt)
      .slice(bankSize)
      .map((m) => m.id),
  );
  if (!ids.size && !dropped.size) return { memories, forgotten: 0 };
  return { memories: flagged.filter((m) => !dropped.has(m.id)), forgotten: ids.size };
}

/** Mark memories stale whose source actions were edited/erased. */
export function markStale(memories: Memory[], changedActionIds: Set<string>): Memory[] {
  return memories.map((m) => (m.actionIds.some((id) => changedActionIds.has(id)) ? { ...m, stale: true } : m));
}

/** Record that memories were used in a prompt (drives eviction). */
export function touchUsed(memories: Memory[], usedIds: Set<string>, now = Date.now()): Memory[] {
  return memories.map((m) => (usedIds.has(m.id) ? { ...m, useCount: m.useCount + 1, lastUsedAt: now } : m));
}
