import { describe, expect, it } from 'vitest';
import { correct } from '@app/session/correct';
import { entityEdits } from '@app/session/entities';
import { textOf } from '@core/memory/assertionIndex';
import type { Fields } from '@core/memory/looks';
import { createBlankAdventure, type Assertion, type Entity } from '@core/model';
import { settled, setup } from './fixtures/session';

const gate: Entity = {
  id: 'ent_gate',
  kind: 'place',
  name: 'Gate',
  aliases: [],
  description: 'An iron gate older than the town.',
  relations: [],
  firstSeen: 0,
  lastSeen: 1,
};

type Over = Partial<Pick<Assertion, 'subject' | 'at' | 'span' | 'basis'>>;
const line = (id: string, f: Fields, over: Over = {}, unseen = false): Assertion => ({
  id,
  subject: gate.id,
  producer: 'turn',
  at: 0,
  basis: 'stated',
  since: 0,
  ...f,
  ...over,
  ...(unseen && { seen: false }),
});
// Read before sources were kept: no edit drops them.
const gateLines = [
  line('as_id_gate', { kind: 'identity', text: gate.description }, { basis: 'legacy' }),
  line('f1', { kind: 'trait', text: 'It is locked at dusk.' }, { basis: 'legacy' }),
];

function withGate(more: Entity[] = [], lines: Assertion[] = []) {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = [gate, ...more];
  adventure.assertions = [...gateLines, ...lines];
  adventure.settings.memory.entityFacts = true;
  return setup({ adventure });
}

const count = (text: string, needle: string) => text.split(needle).length - 1;
const of = (s: ReturnType<typeof setup>['session'], id: string) => s.getSnapshot().adventure.assertions.filter((a) => a.subject === id);

describe('GameSession derived values follow log edits', () => {
  // A state on the scene's place: the cast sends present states, not model traits.
  const oldGate: Entity = { ...gate, id: 'ent_old_gate', name: 'Old Gate' };
  const open = (value: string, span?: string) => {
    const s = withGate([oldGate], [line('f9', { kind: 'state', key: 'condition', value }, { subject: oldGate.id, ...(span && { span }) })]);
    s.session.adv.plot.scene = { location: 'Old Gate', present: [] };
    const first = s.session.getSnapshot().actions[0];
    if (!first) throw new Error('no opening');
    return { ...s, id: first.id };
  };

  it('edit drops a line its action no longer supports, from the drawer and the prompt', async () => {
    const { session, id } = open('hums at night');
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('hums at night');
    session.edit(id, 'You stand at a hedge.');
    expect(of(session, oldGate.id)).toEqual([]);
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).not.toContain('hums at night');
  });

  it('retry drops a line read from the output it replaced', async () => {
    const { session } = withGate();
    session.submit('continue', '');
    await settled(session);
    const at = session.getSnapshot().actions.length - 1;
    session.adv.assertions = [...session.adv.assertions, line('f9', { kind: 'trait', text: 'Said once.' }, { at })];
    session.retry();
    await settled(session);
    expect(of(session, gate.id).map((a) => a.id)).toEqual(['as_id_gate', 'f1']);
  });

  it('a version switch drops what the other version said', () => {
    const { session, id } = open('A hedge grows here.', 'a hedge');
    session.edit(id, 'You stand at a hedge.');
    expect(of(session, oldGate.id)).toHaveLength(1);
    session.setVersion(id, 0);
    expect(of(session, oldGate.id)).toEqual([]);
  });
});

describe('GameSession entity edits', () => {
  it('entity.update publishes and persists', async () => {
    const { session, saved } = withGate();
    entityEdits(session).update(gate.id, { aliases: ['the old gate'] });
    expect(session.getSnapshot().adventure.entities[0]?.aliases).toEqual(['the old gate']);
    await session.flush();
    expect(saved.at(-1)?.entities[0]?.aliases).toEqual(['the old gate']);
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

  it('entity.merge folds one entity into another, its lines too, and deletes it', async () => {
    const door = { ...gate, id: 'ent_door', name: 'Iron door' };
    const { session } = withGate([door], [line('f2', { kind: 'trait', text: 'It creaks.' }, { subject: door.id })]);
    await entityEdits(session).merge(gate.id, door.id);
    const [only, ...rest] = session.getSnapshot().adventure.entities;
    expect(rest).toEqual([]);
    expect(only?.aliases).toEqual(['Iron door']);
    expect(of(session, gate.id).flatMap((a) => (a.kind === 'trait' ? [a.text] : []))).toEqual(['It is locked at dusk.', 'It creaks.']);
    expect(of(session, door.id)).toEqual([]);
  });

  it('merge and delete repoint the scene: to the kept id, then back to a plain name', async () => {
    const door = { ...gate, id: 'ent_door', name: 'Iron door' };
    const { session } = withGate([door]);
    session.adv.plot.scene = { location: door.id, present: [] };
    await entityEdits(session).merge(gate.id, door.id);
    expect(session.getSnapshot().adventure.plot.scene?.location).toBe(gate.id);
    entityEdits(session).delete(gate.id);
    expect(session.getSnapshot().adventure.plot.scene?.location).toBe('Gate');
  });

  it("editLine makes the line the player's and drops its span", () => {
    const { session } = withGate([], [line('f3', { kind: 'effect', condition: 'grim' }, { span: 'grim' })]);
    entityEdits(session).editLine('f3', 'cheerful');
    const a = of(session, gate.id).find((x) => x.id === 'f3');
    expect(a).toMatchObject({ kind: 'effect', condition: 'cheerful', basis: 'player', producer: 'player' });
    expect(a?.span).toBeUndefined();
  });

  it('deleteLine removes the line; endLine keeps it with until, restoreLine clears it', () => {
    const { session } = withGate();
    const edits = entityEdits(session);
    edits.addLine(gate.id, { kind: 'effect', condition: 'Bleeding' });
    const added = of(session, gate.id).at(-1);
    edits.endLine(added?.id ?? '');
    expect(of(session, gate.id).at(-1)?.until).toBe(session.getSnapshot().actions.length);
    edits.restoreLine(added?.id ?? '');
    expect(of(session, gate.id).at(-1)).not.toHaveProperty('until');
    edits.endLine(added?.id ?? '');
    edits.deleteLine('f1');
    expect(of(session, gate.id).map(textOf)).toEqual([gate.description, 'Bleeding']);
  });

  it('setPartOf nests a place in another and back; never a non-place', () => {
    const tower: Entity = { ...gate, id: 'ent_tower', name: 'Tower' };
    const mira: Entity = { ...gate, id: 'ent_mira', kind: 'character', name: 'Mira' };
    const { session } = withGate([tower, mira]);
    const edits = entityEdits(session);
    const get = (id: string) => session.getSnapshot().adventure.entities.find((e) => e.id === id);
    edits.setPartOf(gate.id, tower.id);
    expect(get(gate.id)?.partOf).toBe(tower.id);
    edits.setPartOf(gate.id, undefined);
    expect(get(gate.id)).not.toHaveProperty('partOf');
    edits.setPartOf(mira.id, tower.id);
    expect(get(mira.id)).not.toHaveProperty('partOf');
  });

  it('addLine records a player line per kind; addItem makes a held item', () => {
    const { session } = withGate();
    const edits = entityEdits(session);
    edits.addLine(gate.id, { kind: 'trait', text: 'Hates rust' });
    edits.addLine(gate.id, { kind: 'effect', condition: 'Rusted shut' });
    edits.addLine(gate.id, { kind: 'relationship', to: 'you', stance: 'wary' });
    expect(
      of(session, gate.id)
        .slice(2)
        .map((a) => [a.kind, a.producer, a.basis, a.span]),
    ).toEqual([
      ['trait', 'player', 'player', undefined],
      ['effect', 'player', 'player', undefined],
      ['relationship', 'player', 'player', undefined],
    ]);
    edits.addItem('Gate', 'Brass key');
    const key = session.getSnapshot().adventure.entities.at(-1);
    expect(key).toMatchObject({ kind: 'item', name: 'Brass key' });
    expect(of(session, key?.id ?? '')).toEqual([expect.objectContaining({ kind: 'state', key: 'holder', value: 'Gate', basis: 'player' })]);
  });

  it('setValue, lock, accept and unlock: the player is the author of a key', () => {
    const { session } = withGate();
    const edits = entityEdits(session);
    edits.lock(gate.id, 'eyes', 'grey');
    expect(session.getSnapshot().adventure.entities[0]?.canonKeys).toEqual(['eyes']);
    session.adv.assertions = [...session.adv.assertions, line('c1', { kind: 'conflict', key: 'eyes', claimed: 'blue', canon: 'grey' })];
    edits.accept('c1');
    expect(of(session, gate.id).filter((a) => a.kind === 'look' && a.until === undefined)).toEqual([expect.objectContaining({ key: 'eyes', value: 'blue' })]);
    expect(session.getSnapshot().adventure.entities[0]?.canonKeys).toEqual([]);
    edits.lock(gate.id, 'eyes', 'blue');
    session.adv.assertions = [...session.adv.assertions, line('c2', { kind: 'conflict', key: 'eyes', claimed: 'red', canon: 'blue' })];
    edits.unlock(gate.id, 'eyes');
    expect(of(session, gate.id).some((a) => a.kind === 'conflict')).toBe(false);
  });

  it('a species conflict: Keep canon rewrites the identity, Accept sets the look', () => {
    const clash = (id: string) => line(id, { kind: 'conflict', key: 'species', claimed: 'orc', canon: 'minotaur' }, {}, true);
    const { session } = withGate();
    const edits = entityEdits(session);
    session.adv.assertions = [line('as_i', { kind: 'identity', text: 'A massive Orc, a massive orc.' }), clash('k1')];
    edits.keepCanon('k1');
    expect(of(session, gate.id).map(textOf)).toEqual(['A massive Minotaur, a massive minotaur.']);
    session.adv.assertions = [...session.adv.assertions, clash('k2')];
    edits.accept('k2');
    expect(of(session, gate.id).filter((a) => a.kind !== 'identity')).toEqual([expect.objectContaining({ kind: 'look', key: 'species', value: 'orc' })]);
  });

  it('setIdentity: a non-canon entity gets the player’s identity line, a canon one its card text', () => {
    const { session } = withGate();
    entityEdits(session).setIdentity(gate.id, 'A rusted gate.');
    expect(of(session, gate.id).filter((a) => a.kind === 'identity')).toEqual([expect.objectContaining({ text: 'A rusted gate.', basis: 'player' })]);
    session.adv.entities = [{ ...gate, canon: true }];
    entityEdits(session).setIdentity(gate.id, 'The town gate.');
    expect(session.getSnapshot().adventure.entities[0]?.description).toBe('The town gate.');
    expect(
      of(session, gate.id)
        .filter((a) => a.kind === 'identity')
        .map(textOf),
    ).toEqual(['A rusted gate.']);
  });

  it('correct pins a player line on the named entity, adds no action and sends it next turn', async () => {
    const { session } = withGate();
    session.adv.plot.scene = { location: gate.name, present: [] };
    const actions = session.getSnapshot().adventure.actions.length;
    await correct(session, 'The gate is painted red.');
    const snap = session.getSnapshot();
    expect(snap.adventure.actions).toHaveLength(actions);
    expect(of(session, gate.id).at(-1)).toMatchObject({ kind: 'trait', text: 'The gate is painted red.', producer: 'player', pinned: true });
    expect(snap.notice).toBe('Pinned to Gate');
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('Gate (an iron gate older than the town): The gate is painted red.');
  });

  it('correct about the player pins a player line on you, even when it names an entity, and sends it', async () => {
    const { session } = withGate();
    await correct(session, 'You painted the gate red.');
    expect(of(session, 'you').at(-1)).toMatchObject({ kind: 'trait', text: 'You painted the gate red.', producer: 'player', basis: 'player' });
    expect(of(session, gate.id)).toHaveLength(2);
    expect(session.getSnapshot().notice).toBe('Pinned to you');
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('The player ("you"): You painted the gate red.');
  });

  it('correct with no named entity appends to Plot Essentials', async () => {
    const { session } = withGate();
    session.updatePlot({ plotEssentials: 'You are a courier.' });
    await correct(session, 'It is winter.');
    const snap = session.getSnapshot();
    expect(snap.adventure.plot.plotEssentials).toBe('You are a courier.\nIt is winter.');
    expect(of(session, gate.id)).toHaveLength(2);
    expect(snap.notice).toBe('Added to Plot Essentials');
  });
});
