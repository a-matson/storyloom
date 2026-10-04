import type { Adventure, Memory } from '@core/model';
import * as S from '@core/schema';

const KEY = 'storyloom.pending';

/** localStorage is missing in node (tests) and can throw in a locked-down browser. */
function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (e) {
    console.warn('no localStorage; a save inside the debounce can be lost', e);
    return null;
  }
}

/** Embeddings are large and regenerable, so they stay out of the marker and come back on replay. */
const withoutEmbeddings = (memories: readonly Memory[]) => memories.map(({ embedding: _drop, ...m }) => m);

/**
 * A page can hide or close inside the save debounce, and the Dexie multi-table write cannot
 * finish before unload. localStorage is the only synchronous store, so the dirty adventure goes
 * there first and the next open replays it into Dexie.
 * ponytail: one marker slot, last writer wins — single user, one open adventure at a time.
 */
export function markPending(a: Adventure): void {
  const ls = store();
  if (!ls) return;
  try {
    ls.setItem(KEY, JSON.stringify({ ...a, memories: withoutEmbeddings(a.memories) }));
  } catch (e) {
    // Over quota or blocked: the async flush is still running and usually wins.
    console.warn('could not record a pending save', e);
  }
}

export function clearPending(): void {
  try {
    store()?.removeItem(KEY);
  } catch (e) {
    console.warn('could not clear the pending save marker', e);
  }
}

/** The pending copy of `stored` when one is newer, embeddings carried over by id; else undefined. */
export function takePending(stored: Adventure): Adventure | undefined {
  const raw = store()?.getItem(KEY);
  if (raw === null || raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('discarding a damaged pending save', e);
    clearPending();
    return undefined;
  }
  const r = S.Adventure.safeParse(parsed);
  if (!r.success) {
    console.warn('discarding a pending save that does not parse', r.error.issues[0]?.message);
    clearPending();
    return undefined;
  }
  const pending = r.data;
  // A marker for another adventure is kept: opening that one replays it.
  if (pending.id !== stored.id || pending.updatedAt <= stored.updatedAt) return undefined;
  const embeddings = new Map(stored.memories.map((m) => [m.id, m.embedding]));
  for (const m of pending.memories) m.embedding = embeddings.get(m.id);
  return pending;
}
