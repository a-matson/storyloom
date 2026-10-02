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
 * forgotten. Frequently-used old memories can live forever.
 */

export const MEMORY_SPAN = 6;
export const MEMORY_LAG = 12;
export const SUMMARY_INTERVAL = 15;

export interface MemoryRange {
  fromAction: number;
  toAction: number;
}

/** Which six-action ranges are due for summarisation but not yet in the bank. */
export function dueMemoryRanges(actionCount: number, existing: Pick<Memory, 'fromAction' | 'toAction'>[]): MemoryRange[] {
  const have = new Set(existing.map((m) => `${m.fromAction}-${m.toAction}`));
  const due: MemoryRange[] = [];
  for (let from = 0; from + MEMORY_LAG <= actionCount; from += MEMORY_SPAN) {
    const to = from + MEMORY_SPAN;
    if (!have.has(`${from}-${to}`)) due.push({ fromAction: from, toAction: to });
  }
  return due;
}

/** True when the running Story Summary should be refreshed at this count. */
export function summaryDue(actionCount: number, lastSummarisedAt: number): boolean {
  if (actionCount < SUMMARY_INTERVAL) return false;
  return actionCount - lastSummarisedAt >= SUMMARY_INTERVAL;
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
    if (m.stale) continue;
    const score = query && m.embedding ? cosine(m.embedding, query) : 0;
    ranked.push({ memory: m, score });
  }
  ranked.sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt);
  return ranked.slice(0, limit);
}

/** Return the memories to keep after adding `incoming`, forgetting least-used ones. */
export function evictToSize(memories: Memory[], bankSize: number): { kept: Memory[]; forgotten: Memory[] } {
  if (memories.length <= bankSize) return { kept: memories, forgotten: [] };
  const sorted = memories.toSorted((a, b) => a.useCount - b.useCount || a.createdAt - b.createdAt);
  const forgotten = sorted.slice(0, memories.length - bankSize);
  const forgottenIds = new Set(forgotten.map((m) => m.id));
  return { kept: memories.filter((m) => !forgottenIds.has(m.id)), forgotten };
}

/** Mark memories stale whose source actions were edited/erased. */
export function markStale(memories: Memory[], changedActionIds: Set<string>): Memory[] {
  return memories.map((m) => (m.actionIds.some((id) => changedActionIds.has(id)) ? { ...m, stale: true } : m));
}

/** Record that memories were used in a prompt (drives eviction). */
export function touchUsed(memories: Memory[], usedIds: Set<string>, now = Date.now()): Memory[] {
  return memories.map((m) => (usedIds.has(m.id) ? { ...m, useCount: m.useCount + 1, lastUsedAt: now } : m));
}
