import { describe, expect, it } from 'vitest';
import { memoryEdits } from '@app/session/memories';
import { createBlankAdventure, type Memory } from '@core/model';
import { setup } from './fixtures/session';

const memory: Memory = {
  id: 'mem_0',
  text: 'The gate was locked at dusk.',
  fromAction: 0,
  toAction: 6,
  actionIds: [],
  embedding: [1, 0],
  useCount: 0,
  createdAt: 0,
  stale: true,
};

function withMemory() {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.memories = [memory];
  return setup({ adventure });
}

const first = (s: ReturnType<typeof withMemory>['session']) => s.getSnapshot().adventure.memories[0];

describe('GameSession memory edits', () => {
  it('edit rewrites the text, drops the embedding and the stale flag, and persists', async () => {
    const { session, saved } = withMemory();
    memoryEdits(session).edit(memory.id, 'The gate was left open.');
    expect(first(session)).toEqual({ ...memory, text: 'The gate was left open.', embedding: undefined, stale: undefined });
    await session.flush();
    expect(saved.at(-1)?.memories[0]?.text).toBe('The gate was left open.');
  });

  it('pin and forget round-trip', () => {
    const { session, snapshots } = withMemory();
    const edits = memoryEdits(session);
    edits.pin(memory.id, true);
    expect(first(session)?.pinned).toBe(true);
    edits.pin(memory.id, false);
    expect(first(session)?.pinned).toBe(false);
    edits.forget(memory.id, true);
    expect(first(session)?.forgotten).toBe(true);
    edits.forget(memory.id, false);
    expect(first(session)?.forgotten).toBe(false);
    expect(snapshots).toHaveLength(4);
  });
});
