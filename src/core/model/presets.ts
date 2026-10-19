import type { AdventureSettings } from './types';

type Memory = AdventureSettings['memory'];
export type MemoryPresetId = 'sliceOfLife' | 'adventure';

/** Memory settings by kind of story, over existing fields only. [provisional] guesses, not measured. */
export const MEMORY_PRESETS: Record<MemoryPresetId, { name: string; memory: Partial<Memory> }> = {
  // Few places, many small changes to the same people: a bigger bank and a state read every turn.
  sliceOfLife: { name: 'Slice of life', memory: { bankSize: 400, stateRead: 'every', introductions: true, sceneEachTurn: true } },
  // Fast travel and fights: the state read waits for idle so it never holds up the next turn.
  adventure: { name: 'Adventure', memory: { bankSize: 200, stateRead: 'idle', introductions: true, sceneEachTurn: true } },
};

export const withPreset = (memory: Memory, id: MemoryPresetId): Memory => ({ ...memory, ...MEMORY_PRESETS[id].memory });

/** The preset whose values all match, else `undefined` (Custom). */
export function presetOf(memory: Memory): MemoryPresetId | undefined {
  const ids: MemoryPresetId[] = ['sliceOfLife', 'adventure'];
  // Spreading keeps the key order, so a match changes nothing.
  return ids.find((id) => JSON.stringify(withPreset(memory, id)) === JSON.stringify(memory));
}
