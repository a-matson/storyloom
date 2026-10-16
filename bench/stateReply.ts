import { applyChanges, type StateUpdate } from '@core/memory/stateRead';
import type { Adventure } from '@core/model/types';
import { stateRead, type StateAsk } from '@core/schema/extraction';

/** One helper reply of the state bench, as a row records it. */
export interface Reply {
  ms: number;
  promptMs?: number | undefined;
  cachedTokens?: number | undefined;
  tokens?: number | undefined;
  stop?: string | undefined;
  raw: string;
  parsed?: boolean;
  accepted?: number;
  rejected?: StateUpdate['rejected'];
}

export const parses = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** Read B's part of a merged reply (M17-1), applied as `introduce` applies it; its time is read A's. */
export function mergedB(
  work: Adventure,
  subjects: Parameters<typeof applyChanges>[1],
  q: StateAsk,
  a: { text: string; parsed?: { changes?: unknown } | undefined },
): Reply {
  const changes = stateRead(q.who, q.max).shape.changes.safeParse(a.parsed?.changes).data ?? [];
  const r = applyChanges(work, subjects, changes, q.max);
  return { ms: 0, raw: a.text, parsed: a.parsed !== undefined, accepted: r.changed, rejected: r.rejected };
}
