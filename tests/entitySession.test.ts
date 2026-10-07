import { describe, expect, it } from 'vitest';
import { correct } from '@app/session/correct';
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

  it('correct pins a player fact on the named entity, adds no action and sends it next turn', async () => {
    const { session } = withGate();
    const actions = session.getSnapshot().adventure.actions.length;
    await correct(session, 'The gate is painted red.');
    const snap = session.getSnapshot();
    expect(snap.adventure.actions).toHaveLength(actions);
    expect(snap.adventure.entities[0]?.facts.at(-1)).toMatchObject({ text: 'The gate is painted red.', source: 'player', pinned: true });
    expect(snap.notice).toBe('Pinned to Gate');
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('Gate: The gate is painted red.');
  });

  it('correct with no named entity appends to Plot Essentials', async () => {
    const { session } = withGate();
    session.updatePlot({ plotEssentials: 'You are a courier.' });
    await correct(session, 'It is winter.');
    const snap = session.getSnapshot();
    expect(snap.adventure.plot.plotEssentials).toBe('You are a courier.\nIt is winter.');
    expect(snap.adventure.entities[0]?.facts).toHaveLength(1);
    expect(snap.notice).toBe('Added to Plot Essentials');
  });
});
