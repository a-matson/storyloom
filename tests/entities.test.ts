import { describe, expect, it } from 'vitest';
import { attributeSpeakers, matchEntity, mergeEntities, mergeEntity } from '@core/memory/entities';
import { ENTITY_ENTRY_TOKENS, projectEntity } from '@core/memory/projection';
import type { Action, Entity, ExtractedEntity } from '@core/model';

const seen = (over: Partial<ExtractedEntity> = {}): ExtractedEntity => ({ name: 'Tamsin', kind: 'character', description: '', facts: [], ...over });

describe('entity merge rules', () => {
  it('creates an entity on first sighting', () => {
    const e = mergeEntity(undefined, seen({ description: 'A ferrywoman.', facts: ['She owes the guild.'], aliases: ['the ferrywoman'] }), 4);
    expect(e).toMatchObject({ kind: 'character', name: 'Tamsin', aliases: ['the ferrywoman'], description: 'A ferrywoman.', firstSeen: 4, lastSeen: 4 });
    expect(e.facts).toEqual([expect.objectContaining({ text: 'She owes the guild.', fromAction: 4, source: 'memory' })]);
    expect(e.id).toMatch(/^ent_/);
  });

  it('appends facts, deduped by normalised text, and advances lastSeen', () => {
    const first = mergeEntity(undefined, seen({ facts: ['She owes the guild.'] }), 4);
    const next = mergeEntity(first, seen({ facts: ['she owes  the guild', 'She has a scar.'] }), 10);
    expect(next.facts.map((f) => f.text)).toEqual(['She owes the guild.', 'She has a scar.']);
    expect(next).toMatchObject({ id: first.id, firstSeen: 4, lastSeen: 10 });
  });

  it('keeps an overwritten state value as a fact naming the action', () => {
    const first = mergeEntity(undefined, seen({ state: { location: 'the tavern' } }), 4);
    const next = mergeEntity(first, seen({ state: { location: 'the docks' } }), 23);
    expect(next.state).toEqual({ location: 'the docks' });
    expect(next.facts.map((f) => f.text)).toEqual(['location was the tavern until action 23']);
    expect(mergeEntity(next, seen({ state: { location: 'the docks' } }), 30).facts).toHaveLength(1);
  });

  it('unions aliases without repeating the name', () => {
    const first = mergeEntity(undefined, seen({ aliases: ['the ferrywoman'] }), 1);
    const next = mergeEntity(first, seen({ aliases: ['The Ferrywoman', 'Tam', 'tamsin'] }), 2);
    expect(next.aliases).toEqual(['the ferrywoman', 'Tam']);
  });

  it('keeps player and pinned facts and the existing description over model output', () => {
    const base: Entity = {
      ...mergeEntity(undefined, seen({ description: 'A ferrywoman.' }), 1),
      facts: [
        { id: 'f1', text: 'She is the player’s sister.', fromAction: 1, source: 'player' },
        { id: 'f2', text: 'She fears the river.', fromAction: 1, source: 'memory', pinned: true },
      ],
    };
    const next = mergeEntity(base, seen({ description: 'A smuggler.', facts: ['She is a smuggler.'] }), 9);
    expect(next.description).toBe('A ferrywoman.');
    expect(next.facts.map((f) => f.id).slice(0, 2)).toEqual(['f1', 'f2']);
    expect(next.facts).toHaveLength(3);
  });

  it('matches a name or alias case-insensitively', () => {
    const e = mergeEntity(undefined, seen({ aliases: ['the Ferrywoman'] }), 1);
    expect(matchEntity([e], '  THE ferrywoman ')).toBe(e);
    expect(matchEntity([e], 'tamsin')).toBe(e);
    expect(matchEntity([e], 'Odo')).toBeUndefined();
  });
});

describe('mergeEntities', () => {
  it('unions facts, aliases, relations and missing state, keeping the target', () => {
    const into: Entity = { ...mergeEntity(undefined, seen({ facts: ['She owes the guild.'], state: { mood: 'wary' } }), 2), portraitId: 'p1' };
    const from: Entity = {
      ...mergeEntity(undefined, seen({ name: 'The ferrywoman', description: 'Rows the night ferry.', facts: ['she owes the guild', 'She has a scar.'] }), 9),
      state: { mood: 'calm', location: 'the docks' },
      relations: [{ to: 'Odo', label: 'rival' }],
      portraitId: 'p2',
    };
    const merged = mergeEntities(into, from);
    expect(merged).toMatchObject({ id: into.id, name: 'Tamsin', portraitId: 'p1', description: 'Rows the night ferry.', firstSeen: 2, lastSeen: 9 });
    expect(merged.aliases).toEqual(['The ferrywoman']);
    expect(merged.facts.map((f) => f.text)).toEqual(['She owes the guild.', 'She has a scar.']);
    expect(merged.state).toEqual({ mood: 'wary', location: 'the docks' });
    expect(merged.relations).toEqual([{ to: 'Odo', label: 'rival' }]);
  });
});

describe('attributeSpeakers', () => {
  const act = (id: string, type: Action['type'], text: string): Action => ({ id, type, versions: [text], active: 0, createdAt: 0 });
  const cast = [mergeEntity(undefined, seen({ aliases: ['the ferrywoman'] }), 0), mergeEntity(undefined, seen({ name: 'Odo' }), 0)];
  const actions = [
    act('a0', 'continue', 'The river is high.\n\n"Hold the rope," the old voice says.'),
    act('a1', 'say', '> You say "Hello."'),
    act('a2', 'continue', '"Row," Odo says.\n\n"I am," says Tamsin.'),
  ];

  it('labels the quoted paragraphs of a lone speaker, by entity name', () => {
    expect(attributeSpeakers(actions, [{ action: 0, name: 'The Ferrywoman' }], cast).get('a0')).toEqual([{ paragraph: 1, name: 'Tamsin' }]);
  });

  it('drops names no entity matches and player actions', () => {
    const out = attributeSpeakers(
      actions,
      [
        { action: 0, name: 'Ysolde' },
        { action: 1, name: 'Tamsin' },
        { action: 9, name: 'Odo' },
      ],
      cast,
    );
    expect(out.size).toBe(0);
  });

  it('lets the text decide between several speakers of one action', () => {
    const out = attributeSpeakers(
      actions,
      [
        { action: 2, name: 'Odo' },
        { action: 2, name: 'Tamsin' },
      ],
      cast,
    );
    expect(out.get('a2')).toEqual([
      { paragraph: 0, name: 'Odo' },
      { paragraph: 1, name: 'Tamsin' },
    ]);
  });
});

describe('projectEntity', () => {
  it('is a story card triggered by name and aliases, with state lines', () => {
    const e = mergeEntity(undefined, seen({ aliases: ['ferrywoman'], description: 'A ferrywoman.', state: { location: 'the docks' } }), 1);
    expect(projectEntity(e)).toEqual({
      id: e.id,
      type: 'character',
      name: 'Tamsin',
      triggers: ['Tamsin', 'ferrywoman'],
      entry: 'Tamsin: A ferrywoman.\nlocation: the docks',
    });
  });

  it('trims the entry at the token cap', () => {
    const e = mergeEntity(undefined, seen({ description: 'word '.repeat(400) }), 1);
    const entry = projectEntity(e).entry;
    expect(entry.length).toBeLessThanOrEqual(ENTITY_ENTRY_TOKENS * 4);
    expect(entry.length).toBeGreaterThan(ENTITY_ENTRY_TOKENS * 3);
    expect(entry.endsWith('word')).toBe(true);
  });
});
