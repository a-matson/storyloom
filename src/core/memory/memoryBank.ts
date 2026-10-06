import type { Action, Memory } from '../model/types';
import { newId } from '../model/types';
import { mmr, rrf, RRF_K } from './fusion';

/**
 * Memory Bank: storage, retrieval and scheduling of AI-written memories.
 *
 * A Memory summarises six consecutive actions. Scheduling (AI Dungeon rules):
 *  - the first memory is written once the adventure is 12 actions deep and
 *    covers actions 0–5; the next covers 6–11 once there are 18 actions, and
 *    so on. The most recent six actions are never summarised, so they stay
 *    freely editable. A range that would end on a player action stops one short.
 *  - the Story Summary is refreshed every 15 actions.
 *
 * Retrieval: memories are embedded; the most recent action is embedded as the
 * query; cosine similarity and BM25 rank the bank, fused by RRF, the head diversified
 * by MMR; the builder takes as many as fit.
 * Memories are only used once the whole history no longer fits the context.
 *
 * Eviction: when the bank is full, the least-used memory (then the oldest) is
 * forgotten: flagged and kept, so its range is not summarised again. Frequently-used
 * old memories can live forever. Edits mark memories stale; the idle job rewrites them.
 */

/** [AID-doc] */
export const MEMORY_SPAN = 6;
/** [AID-doc] */
export const MEMORY_LAG = 12;
/** [AID-doc] */
export const SUMMARY_INTERVAL = 15;

export interface MemoryRange {
  fromAction: number;
  toAction: number;
}

/** Player turns render as `> You …`; a passage ending on one makes the model answer it. */
export const isPlayerAction = (a?: Pick<Action, 'type'>): boolean => a?.type === 'do' || a?.type === 'say';

/**
 * Ranges of up to six actions due for summarisation: those after the newest memory. Ranges before it
 * were summarised already, even if that memory has since been dropped from the forgotten pile.
 * A range ends on an AI output; trailing player actions roll into the next range.
 */
export function dueMemoryRanges(actions: Pick<Action, 'type'>[], existing: Pick<Memory, 'toAction'>[]): MemoryRange[] {
  const due: MemoryRange[] = [];
  let from = existing.reduce((n, m) => Math.max(n, m.toAction), 0);
  while (from + MEMORY_LAG <= actions.length) {
    let to = from + MEMORY_SPAN;
    while (to > from + 1 && isPlayerAction(actions[to - 1])) to--;
    due.push({ fromAction: from, toAction: to });
    from = to;
  }
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

/**
 * Actions a memory may wait past due (about three turns) before it runs even while the player types.
 * A memory call takes ~10 s and a reading gap is shorter, so a deferred memory is cut by typing and
 * only ever completes once overdue: raising this just makes the bank staler before the same one
 * contended turn. [measured: docs/measurements/2026-10-04-live-play-overlap.json]
 */
export const MEMORY_OVERDUE = 6;

/** True when the next memory has waited `MEMORY_OVERDUE` actions, so typing no longer defers it. */
export function memoryOverdue(actionCount: number, existing: Pick<Memory, 'toAction'>[]): boolean {
  const start = existing.reduce((n, m) => Math.max(n, m.toAction), 0);
  return actionCount - start - MEMORY_LAG >= MEMORY_OVERDUE;
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

/** [provisional] how much of the fused head MMR reorders; more than a memory block holds */
export const MMR_POOL = 30;

const vectorSim = (a: Memory, b: Memory): number => (a.embedding && a.embedding.length === b.embedding?.length ? cosine(a.embedding, b.embedding) : 0);

/**
 * Rank the bank by relevance to a query embedding. Brute force is fine for ≤ 800 vectors.
 * Given `lexical` (BM25 hits, best first; ids that are not memories are ignored), the cosine order
 * is fused with it by RRF and the head is reordered by MMR; score 1 is first in both lists.
 */
export function rankMemories(memories: Memory[], query: number[] | undefined, limit = Infinity, lexical?: readonly string[]): RankedMemory[] {
  const ranked = rankByCosine(memories, query);
  if (!lexical) return ranked.slice(0, limit);
  const byId = new Map(ranked.map((r) => [r.memory.id, r.memory]));
  const fused = rrf([ranked.map((r) => r.memory.id), lexical]).flatMap(([id, score]) => {
    const memory = byId.get(id);
    return memory ? [{ item: memory, score: (score * (RRF_K + 1)) / 2 }] : [];
  });
  return [...mmr(fused.slice(0, MMR_POOL), vectorSim), ...fused.slice(MMR_POOL)].slice(0, limit).map(({ item, score }) => ({ memory: item, score }));
}

function rankByCosine(memories: Memory[], query: number[] | undefined): RankedMemory[] {
  const ranked: RankedMemory[] = [];
  for (const m of memories) {
    if (!isActive(m)) continue;
    // Vectors from another embedder (other length) are not comparable; they rank by recency until re-embedded.
    const score = query && m.embedding?.length === query.length ? cosine(m.embedding, query) : 0;
    ranked.push({ memory: m, score });
  }
  return ranked.toSorted((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt);
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
