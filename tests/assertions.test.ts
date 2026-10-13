import { describe, expect, it } from 'vitest';
import { deriveAssertions, migrateEntities } from '@core/memory/assertions';
import { isLegacy } from '@core/memory/assertionIndex';
import type { Action, EntityFact, LegacyEntity } from '@core/model/types';

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });
const actions = [act('a0', 'You reach the river.'), act('a1', 'Tamsin, grey-haired, rows the ferry.'), act('a2', 'The far bank is dark.')];

const fact = (id: string, p: Partial<EntityFact>): EntityFact => ({ id, text: id, fromAction: 1, source: 'memory', ...p });
const entity = (p: Partial<LegacyEntity>): LegacyEntity => ({
  id: 'ent_t',
  kind: 'character',
  name: 'Tamsin',
  aliases: [],
  description: '',
  facts: [],
  state: {},
  relations: [],
  firstSeen: 1,
  lastSeen: 2,
  ...p,
});
const derive = (e: LegacyEntity) => deriveAssertions({ entities: [e], actions });

describe('deriveAssertions', () => {
  it('maps each fact kind, with at from the source action and since from fromAction', () => {
    const e = entity({
      facts: [
        fact('f1', { text: 'She rows the ferry.', sourceId: 'a1', evidence: 'rows the ferry', fromAction: 2 }),
        fact('f2', { kind: 'state', key: 'hair', value: 'grey', sourceId: 'a1' }),
        fact('f3', { kind: 'state', key: 'mood', value: 'tired', until: 2 }),
        fact('f4', { kind: 'state', key: 'wearing', value: 'oilskins' }),
        fact('f5', { kind: 'effect', value: 'soaked', cause: { kind: 'item', id: 'ent_b', text: 'the bucket' }, source: 'player' }),
        fact('f6', { kind: 'relationship', key: 'Odo', value: 'owes him', basis: 'inferred', sourceId: 'a2' }),
        fact('f7', { text: 'Pinned.', source: 'player', pinned: true }),
      ],
    });
    expect(derive(e)).toEqual([
      {
        id: 'as_f1',
        subject: 'ent_t',
        producer: 'legacy',
        at: 1,
        span: 'rows the ferry',
        basis: 'stated',
        since: 2,
        kind: 'trait',
        text: 'She rows the ferry.',
      },
      { id: 'as_f2', subject: 'ent_t', producer: 'legacy', at: 1, basis: 'stated', since: 1, kind: 'look', key: 'hair', value: 'grey' },
      { id: 'as_f3', subject: 'ent_t', producer: 'legacy', at: 1, basis: 'legacy', since: 1, until: 2, kind: 'state', key: 'mood', value: 'tired' },
      { id: 'as_f4', subject: 'ent_t', producer: 'legacy', at: 1, basis: 'legacy', since: 1, kind: 'state', key: 'wearing', value: 'oilskins' },
      {
        id: 'as_f5',
        subject: 'ent_t',
        producer: 'player',
        at: 1,
        basis: 'player',
        since: 1,
        kind: 'effect',
        condition: 'soaked',
        cause: { kind: 'item', id: 'ent_b', text: 'the bucket' },
      },
      { id: 'as_f6', subject: 'ent_t', producer: 'legacy', at: 2, basis: 'inferred', since: 1, kind: 'relationship', to: 'Odo', stance: 'owes him' },
      { id: 'as_f7', subject: 'ent_t', producer: 'player', at: 1, basis: 'player', since: 1, pinned: true, kind: 'trait', text: 'Pinned.' },
    ]);
  });

  it('drops a span the action no longer holds, and falls back to fromAction when the source is gone', () => {
    const e = entity({ facts: [fact('f1', { sourceId: 'a1', evidence: 'a boy rows' }), fact('f2', { sourceId: 'gone', fromAction: 0 })] });
    const [one, two] = derive(e);
    expect(one).toMatchObject({ at: 1, basis: 'stated' });
    expect(one).not.toHaveProperty('span');
    expect(two).toMatchObject({ at: 0, basis: 'stated' });
  });

  it('keeps conflicts only for locked keys', () => {
    const conflict = (id: string, key: string) => fact(id, { conflict: true, claim: { key, value: 'red' } });
    const e = entity({ state: { eyes: 'green', build: 'tall' }, canonKeys: ['eyes'], facts: [conflict('c1', 'eyes'), conflict('c2', 'build')] });
    const conflicts = derive(e).filter((x) => x.kind === 'conflict');
    expect(conflicts).toEqual([
      { id: 'as_c1', subject: 'ent_t', producer: 'legacy', at: 1, basis: 'legacy', since: 1, kind: 'conflict', key: 'eyes', claimed: 'red', canon: 'green' },
    ]);
  });

  it('turns the description, the state map and the appearance into assertions', () => {
    const e = entity({
      description: 'A ferrywoman.',
      appearance: 'grey hair, oilskins',
      state: { eyes: 'green', location: 'the docks' },
      facts: [fact('f1', { kind: 'state', key: 'location', value: 'the inn' })],
    });
    expect(derive(e).filter((x) => x.id !== 'as_f1')).toEqual([
      { id: 'as_id_ent_t', subject: 'ent_t', producer: 'legacy', at: 1, basis: 'legacy', since: 1, kind: 'identity', text: 'A ferrywoman.' },
      { id: 'as_st_ent_t_eyes', subject: 'ent_t', producer: 'player', at: 1, basis: 'player', since: 1, kind: 'look', key: 'eyes', value: 'green' },
      // The model's current location overrides the player's map value.
      {
        id: 'as_st_ent_t_location',
        subject: 'ent_t',
        producer: 'player',
        at: 1,
        basis: 'player',
        since: 1,
        until: 2,
        kind: 'state',
        key: 'location',
        value: 'the docks',
      },
      { id: 'as_lk_ent_t', subject: 'ent_t', producer: 'legacy', at: 1, basis: 'legacy', since: 1, kind: 'look', key: 'legacy', value: 'grey hair, oilskins' },
    ]);
    expect(derive({ ...e, canon: true })[0]).toMatchObject({ producer: 'card' });
  });

  it('is idempotent', () => {
    const e = entity({ description: 'A ferrywoman.', facts: [fact('f1', { sourceId: 'a1', evidence: 'rows the ferry' })] });
    expect(derive(e)).toEqual(derive(e));
  });
});

describe('migrateEntities', () => {
  const tamsin = entity({ description: 'A ferrywoman.', facts: [fact('f1', { sourceId: 'a1', evidence: 'rows the ferry' })], state: { mood: 'calm' } });

  it('derives an adventure without assertions and leaves its entities without legacy fields', () => {
    const out = migrateEntities([tamsin], actions, []);
    expect(out.assertions).toEqual(derive(tamsin));
    expect(out.entities).toEqual([{ id: 'ent_t', kind: 'character', name: 'Tamsin', aliases: [], description: '', relations: [], firstSeen: 1, lastSeen: 2 }]);
    expect(out.entities.some(isLegacy)).toBe(false);
  });

  it('keeps stored assertions, and a canon description', () => {
    const stored = derive(tamsin).filter((a) => a.kind !== 'trait');
    const out = migrateEntities([tamsin, entity({ id: 'ent_c', description: 'Card text.', canon: true })], actions, stored);
    expect(out.assertions).toEqual(stored);
    expect(out.entities.map((e) => e.description)).toEqual(['', 'Card text.']);
  });

  it('moves a non-canon description no identity assertion covers', () => {
    const stored = derive(tamsin).filter((a) => a.kind !== 'identity');
    expect(migrateEntities([tamsin], actions, stored).assertions.at(-1)).toMatchObject({ id: 'as_id_ent_t', kind: 'identity', text: 'A ferrywoman.' });
  });
});
