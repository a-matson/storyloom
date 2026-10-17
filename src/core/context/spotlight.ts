import type { AssertionIndex } from '../memory/assertionIndex';
import type { Action, Entity } from '../model/types';

/**
 * Cast-line order for who is here. `fixed`: the scene's order. `quietFirst`/`quietLast`: by `lastActive`.
 * Quietest first: 20 of 86 present characters spoke vs 13 fixed, 19 quietest last (one seed per point).
 * [measured: docs/measurements/2026-10-17-spotlight-m17.json]
 */
export type SpotlightOrder = 'fixed' | 'quietFirst' | 'quietLast';
export const SPOTLIGHT: SpotlightOrder = 'quietFirst';

// "the Old Well" in the scene names the entity "Old Well".
const norm = (n: string) => n.trim().toLowerCase().replace(/^the /, '');
export const named = (e: Entity, n: string) => [e.name, ...e.aliases].some((k) => norm(k) === norm(n));

/** The latest action a stored speaker label names `e` in, or an accepted state change on `e` became true at; never: -1. */
export function lastActive(e: Entity, actions: readonly Action[], ix: AssertionIndex): number {
  const spoke = actions.findLastIndex((a) => a.speakers?.some((s) => named(e, s.name)));
  const changed = ix.of(e.id).filter((a) => a.kind === 'state' && a.seen !== false);
  return Math.max(spoke, ...changed.map((a) => a.since));
}

/** `here` with its characters reordered in their own slots (stable); the place and anything else stay put. */
export function spotlight(here: Entity[], actions: readonly Action[], ix: AssertionIndex, order: SpotlightOrder = SPOTLIGHT): Entity[] {
  if (order === 'fixed') return here;
  const at = (e: Entity) => lastActive(e, actions, ix) * (order === 'quietFirst' ? 1 : -1);
  const sorted = here.filter((e) => e.kind === 'character').toSorted((a, b) => at(a) - at(b));
  return here.map((e) => (e.kind === 'character' ? (sorted.shift() ?? e) : e));
}
