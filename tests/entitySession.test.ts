import { describe, expect, it } from 'vitest';
import { correct } from '@app/session/correct';
import { entityEdits } from '@app/session/entities';
import { actionText, createBlankAdventure, type Entity } from '@core/model';
import { hashPrompt } from '@core/trace';
import { settled, setup } from './fixtures/session';

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
  lastSeen: 1,
};

function withGate(...more: Entity[]) {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = [gate, ...more];
  adventure.settings.memory.entityFacts = true;
  return setup({ adventure });
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('GameSession derived values follow log edits', () => {
  // A state on the scene's place: the cast sends present states, not model traits.
  const sourced = (text: string, opening: string): Entity => ({
    ...gate,
    id: 'ent_old_gate',
    name: 'Old Gate',
    facts: [{ id: 'f9', text, fromAction: 0, source: 'memory', sourceId: 'x', sourceHash: hashPrompt(opening), kind: 'state', key: 'condition', value: text }],
  });
  const open = (fact: string, from = 'You stand at the gate.') => {
    const s = withGate(sourced(fact, from));
    s.session.adv.plot.scene = { location: 'Old Gate', present: [] };
    const first = s.session.getSnapshot().actions[0];
    if (!first) throw new Error('no opening');
    const e = s.session.adv.entities[1]?.facts[0];
    if (e) e.sourceId = first.id;
    return { ...s, id: first.id };
  };

  it('edit drops a fact its action no longer supports, from the drawer and the prompt', async () => {
    const { session, id } = open('The gate hums at night.');
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('hums at night');
    session.edit(id, 'You stand at a hedge.');
    expect(session.getSnapshot().adventure.entities[1]?.facts).toEqual([]);
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).not.toContain('hums at night');
  });

  it('retry drops a fact sourced from the output it replaced', async () => {
    const { session } = withGate();
    session.submit('continue', '');
    await settled(session);
    const last = session.getSnapshot().actions.at(-1);
    if (!last) throw new Error('no output');
    const said = { id: 'f9', text: 'Said once.', fromAction: 1, source: 'memory' as const, sourceId: last.id, sourceHash: hashPrompt(actionText(last)) };
    session.adv.entities = [{ ...gate, facts: [...gate.facts, said] }];
    session.retry();
    await settled(session);
    expect(session.getSnapshot().adventure.entities[0]?.facts.map((f) => f.id)).toEqual(['f1']);
  });

  it('a version switch drops what the other version said', () => {
    const { session, id } = open('A hedge grows here.', 'You stand at a hedge.');
    session.edit(id, 'You stand at a hedge.');
    expect(session.getSnapshot().adventure.entities[1]?.facts).toHaveLength(1);
    session.setVersion(id, 0);
    expect(session.getSnapshot().adventure.entities[1]?.facts).toEqual([]);
  });
});

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
