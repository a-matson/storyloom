import type { Adventure, Memory } from '@core/model';
import type { GameSession } from './session';

/**
 * The player's edits to `adv.memories`, through the session's `mutate`. Only the lazy Memories tab
 * imports it, like `entityEdits`. An edited memory whose actions later change is still rewritten by
 * stale regeneration.
 */
export function memoryEdits(host: GameSession) {
  const patch = (id: string, fn: (m: Memory) => Memory) =>
    host.mutate((_, adv: Adventure) => (adv.memories = adv.memories.map((m) => (m.id === id ? fn(m) : m))));
  return {
    pin: (id: string, pinned: boolean) => patch(id, (m) => ({ ...m, pinned })),
    forget: (id: string, forgotten: boolean) => patch(id, (m) => ({ ...m, forgotten })),
    /** The idle `reembed` picks up a memory without an embedding. */
    edit: (id: string, text: string) => patch(id, ({ embedding: _e, stale: _s, ...m }) => ({ ...m, text })),
  };
}
