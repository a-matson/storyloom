import { describe, expect, it } from 'vitest';
import { entityEdits } from '@app/session/entities';
import { createBlankAdventure, type Entity } from '@core/model';
import { setup } from './fixtures/session';

const gate: Entity = {
  id: 'ent_gate',
  kind: 'place',
  name: 'Gate',
  aliases: [],
  description: 'An iron gate older than the town.',
  facts: [{ id: 'f1', text: 'It is locked at dusk.', fromAction: 0, source: 'memory' }],
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
};

function withGate(...more: Entity[]) {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = [gate, ...more];
  return setup({ adventure });
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('GameSession entity edits', () => {
  it('entity.update publishes and persists', async () => {
    const { session, saved } = withGate();
    entityEdits(session).update(gate.id, { state: { lock: 'open' } });
    expect(session.getSnapshot().adventure.entities[0]?.state).toEqual({ lock: 'open' });
    await session.flush();
    expect(saved.at(-1)?.entities[0]?.state).toEqual({ lock: 'open' });
  });

  it('entity.promote adds one story card and stops the projection', async () => {
    const { session } = withGate();
    await session.previewContext();
    expect(count(session.getSnapshot().context?.prompt ?? '', 'older than the town')).toBe(1);
    await entityEdits(session).promote(gate.id);
    const adv = session.getSnapshot().adventure;
    expect(adv.storyCards).toHaveLength(1);
    expect(adv.entities[0]?.cardId).toBe(adv.storyCards[0]?.id);
    await session.previewContext();
    expect(count(session.getSnapshot().context?.prompt ?? '', 'older than the town')).toBe(1);
  });

  it('projects a promoted entity again once its card is deleted', async () => {
    const { session } = withGate();
    await entityEdits(session).promote(gate.id);
    session.setStoryCards([]);
    await session.previewContext();
    expect(count(session.getSnapshot().context?.prompt ?? '', 'older than the town')).toBe(1);
  });

  it('entity.merge folds one entity into another and deletes it', async () => {
    const { session } = withGate({ ...gate, id: 'ent_door', name: 'Iron door', facts: [{ id: 'f2', text: 'It creaks.', fromAction: 0, source: 'memory' }] });
    await entityEdits(session).merge(gate.id, 'ent_door');
    const [only, ...rest] = session.getSnapshot().adventure.entities;
    expect(rest).toEqual([]);
    expect(only?.aliases).toEqual(['Iron door']);
    expect(only?.facts.map((f) => f.text)).toEqual(['It is locked at dusk.', 'It creaks.']);
  });
});
