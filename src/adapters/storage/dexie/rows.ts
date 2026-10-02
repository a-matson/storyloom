import type { Action, Adventure, Memory, StoryCard } from '@core/model';

/** Adventure without its collections; those live in their own tables. */
export type AdventureRow = Omit<Adventure, 'actions' | 'memories' | 'storyCards'>;
export type ActionRow = Action & { adventureId: string; seq: number };
export type CardRow = StoryCard & { adventureId: string };
// Float32Array: ~1.5 KB per 384-d vector instead of ~7.7 KB as JSON numbers.
export type MemoryRow = Omit<Memory, 'embedding'> & { adventureId: string; embedding?: Float32Array | undefined };

export function splitAdventure(a: Adventure): { meta: AdventureRow; actions: ActionRow[]; cards: CardRow[]; memories: MemoryRow[] } {
  const { actions, memories, storyCards, ...meta } = a;
  return {
    meta,
    actions: actions.map((x, seq) => toActionRow(a.id, x, seq)),
    cards: storyCards.map((c) => toCardRow(a.id, c)),
    memories: memories.map((m) => toMemoryRow(a.id, m)),
  };
}

export const toActionRow = (adventureId: string, a: Action, seq: number): ActionRow => ({ ...a, adventureId, seq });
export const toCardRow = (adventureId: string, c: StoryCard): CardRow => ({ ...c, adventureId });
export function toMemoryRow(adventureId: string, m: Memory): MemoryRow {
  const { embedding, ...rest } = m;
  return { ...rest, adventureId, ...(embedding ? { embedding: Float32Array.from(embedding) } : {}) };
}

/** Rows back to plain model objects (drops storage-only keys, numbers back to arrays). */
export function joinAdventure(meta: AdventureRow, actions: ActionRow[], cards: CardRow[], memories: MemoryRow[]): unknown {
  return {
    ...meta,
    actions: actions.toSorted((x, y) => x.seq - y.seq).map(({ adventureId: _a, seq: _s, ...a }) => a),
    storyCards: cards.map(({ adventureId: _a, ...c }) => c),
    memories: memories.map(({ adventureId: _a, embedding, ...m }) => ({ ...m, ...(embedding ? { embedding: Array.from(embedding) } : {}) })),
  };
}
