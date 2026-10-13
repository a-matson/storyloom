import type { Entity } from '../model/types';
import { norm } from './names';

// Apart from `names.ts`, which is in the start-up chunk: only the lazy fold needs these.

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] ?? 0;
}

/** Names this short sit within 2 edits of too many others (Mina, Minos). [provisional] */
const SPELLING_MIN = 5;

/** The one entity of `kind` whose name or alias `name` misspells by 1-2 edits (Weaver for Weever). */
export function spellingOf(entities: readonly Entity[], name: string, kind: Entity['kind']): Entity | undefined {
  const n = norm(name);
  const near = (k: string) => {
    const d = n.length >= SPELLING_MIN && norm(k).length >= SPELLING_MIN ? editDistance(n, norm(k)) : 0;
    return d > 0 && d <= 2;
  };
  const hits = entities.filter((e) => e.kind === kind && [e.name, ...e.aliases].some(near));
  return hits.length === 1 ? hits[0] : undefined;
}
