import { describe, expect, it } from 'vitest';
import { mergeAssertions } from '@core/memory/assertionWrites';
import { entityNamedIn, knownAs, matchEntity, mergeEntities, mergeEntity, namedInPassage, type Sighting } from '@core/memory/entities';
import { isConfirmed } from '@core/memory/facts';
import { castLabels } from '@core/memory/names';
import { byPlayer, setValue } from '@core/memory/looks';
import { ENTITY_ENTRY_TOKENS, projectEntity } from '@core/memory/projection';
import type { Entity } from '@core/model';

const seen = (over: Partial<Sighting> = {}): Sighting => ({ name: 'Tamsin', kind: 'character', description: '', facts: [], ...over });

describe('entity merge rules', () => {
  it('creates an entity on first sighting', () => {
    const e = mergeEntity(undefined, seen({ description: 'A ferrywoman.', aliases: ['the ferrywoman'] }), 4);
    // Who it is goes to an identity assertion (`mergeAssertions`), not the card-text field.
    expect(e).toMatchObject({ kind: 'character', name: 'Tamsin', aliases: ['the ferrywoman'], description: '', firstSeen: 4, lastSeen: 4 });
    expect(e.id).toMatch(/^ent_/);
    expect(mergeEntity(e, seen(), 10)).toMatchObject({ id: e.id, firstSeen: 4, lastSeen: 10 });
  });

  it('unions aliases without repeating the name', () => {
    const first = mergeEntity(undefined, seen({ aliases: ['the ferrywoman'] }), 1);
    const next = mergeEntity(first, seen({ aliases: ['The Ferrywoman', 'Tam', 'tamsin'] }), 2);
    expect(next.aliases).toEqual(['the ferrywoman', 'Tam']);
  });

  it('never takes a description from model output', () => {
    const base = mergeEntity(undefined, seen({ description: 'A ferrywoman.' }), 1);
    expect(mergeEntity({ ...base, description: 'Card text.', canon: true }, seen({ description: 'A smuggler.' }), 9).description).toBe('Card text.');
    expect(mergeEntity({ ...base, description: '', canon: true }, seen({ description: 'A smuggler.' }), 9).description).toBe('');
    expect(mergeEntity(undefined, seen(), 1)).not.toHaveProperty('appearance');
  });

  it('matches a name or alias case-insensitively', () => {
    const e = mergeEntity(undefined, seen({ aliases: ['the Ferrywoman'] }), 1);
    expect(matchEntity([e], '  THE ferrywoman ')).toBe(e);
    expect(matchEntity([e], 'tamsin')).toBe(e);
    expect(matchEntity([e], 'Odo')).toBeUndefined();
  });

  it('finds the entity a sentence names, longest name first, whole words only', () => {
    const lena = mergeEntity(undefined, seen({ name: 'Lena' }), 1);
    const morrow = mergeEntity(undefined, seen({ name: 'Lena Morrow', aliases: ['the Captain'] }), 1);
    expect(entityNamedIn([lena, morrow], 'Lena Morrow has blue eyes.')).toBe(morrow);
    expect(entityNamedIn([lena, morrow], "lena's eyes are blue")).toBe(lena);
    expect(entityNamedIn([lena, morrow], 'The captain never drinks')).toBe(morrow);
    expect(entityNamedIn([lena, morrow], 'Magdalena is tall')).toBeUndefined();
  });

  it('finds a character by a role', () => {
    const weever: Entity = { ...mergeEntity(undefined, seen({ name: 'Weever' }), 1), roles: ['the kobold'] };
    const odo = mergeEntity(undefined, seen({ name: 'Odo' }), 1);
    expect(matchEntity([odo, weever], 'The Kobold')).toBe(weever);
    expect(knownAs([odo, weever], 'kobold')).toBe(weever);
    expect(entityNamedIn([odo, weever], 'You hand the kobold a coin.')).toBe(weever);
  });

  it('labels characters of one name for the enums, and resolves each label', () => {
    const card = (description: string, at: number): Entity => ({ ...mergeEntity(undefined, seen({ name: 'Lena' }), at), description, canon: true });
    const miller = card('the miller of Ashford.', 1);
    const soldier = card('a soldier.', 2);
    expect([...castLabels([soldier, miller]).values()]).toEqual(['Lena (the miller of)', 'Lena (a soldier)']);
    expect(knownAs([miller, soldier], 'Lena (a soldier)')).toBe(soldier);
    expect(knownAs([miller, soldier], 'Lena (the miller of)')).toBe(miller);
    expect([...castLabels([miller, card('', 3)]).values()]).toEqual(['Lena (#1)', 'Lena (#2)']);
    expect(castLabels([miller]).size).toBe(0);
  });
});

describe('mergeEntities', () => {
  it('unions aliases and relations, keeping the target', () => {
    const into: Entity = { ...mergeEntity(undefined, seen(), 2), portraitId: 'p1' };
    const from: Entity = {
      ...mergeEntity(undefined, seen({ name: 'The ferrywoman', description: 'Rows the night ferry.' }), 9),
      relations: [{ to: 'Odo', label: 'rival' }],
      portraitId: 'p2',
    };
    const merged = mergeEntities(into, from);
    expect(merged).toMatchObject({ id: into.id, name: 'Tamsin', portraitId: 'p1', description: '', firstSeen: 2, lastSeen: 9 });
    expect(merged.aliases).toEqual(['The ferrywoman']);
    expect(merged.relations).toEqual([{ to: 'Odo', label: 'rival' }]);
    expect(merged).not.toHaveProperty('roles');
    expect(mergeEntities({ ...into, roles: ['the ferrywoman'] }, { ...from, roles: ['the old woman', 'the ferrywoman'] }).roles).toEqual([
      'the old woman',
      'the ferrywoman',
    ]);
  });
});

describe('projectEntity', () => {
  it('is a story card triggered by name and aliases, with its identity and the values the player set that are still current', () => {
    const e = mergeEntity(undefined, seen({ aliases: ['ferrywoman'] }), 1);
    const story = mergeAssertions(e, [], { description: 'A ferrywoman.', facts: [], state: { mood: 'wary' } }, 1, { producer: 'turn' });
    const own = setValue(e, setValue(e, story, 'location', 'the docks', 2), 'mood', 'calm', 2);
    const later = mergeAssertions(e, own, { description: '', facts: [], state: { mood: 'tired' } }, 3, { producer: 'turn' });
    expect(projectEntity(e, later)).toEqual({
      id: e.id,
      type: 'character',
      name: 'Tamsin',
      triggers: ['Tamsin', 'ferrywoman'],
      entry: 'Tamsin: A ferrywoman.\nlocation: the docks',
    });
  });

  it('trims the entry at the token cap', () => {
    const e = mergeEntity(undefined, seen(), 1);
    const entry = projectEntity(e, mergeAssertions(e, [], { description: 'word '.repeat(400), facts: [] }, 1, { producer: 'turn' })).entry;
    expect(entry.length).toBeLessThanOrEqual(ENTITY_ENTRY_TOKENS * 4);
    expect(entry.length).toBeGreaterThan(ENTITY_ENTRY_TOKENS * 3);
    expect(entry.endsWith('word')).toBe(true);
  });
});

describe('namedInPassage', () => {
  it('needs the exact name, as whole words, somewhere other than a sentence start', () => {
    expect(namedInPassage('Tamsin', '[3] The boat rocks and Tamsin grips the oar.')).toBe(true);
    expect(namedInPassage('Tamsin', "You follow Tamsin's lantern.")).toBe(true);
    expect(namedInPassage('Tamsin', '"Run," Tamsin says.')).toBe(true);
    expect(namedInPassage('Something', 'Something moves. You wait. Something large stirs.')).toBe(false);
    expect(namedInPassage('Cobblestones', 'You walk over the cobblestones.')).toBe(false);
    expect(namedInPassage('Inn', 'The Innkeeper nods.')).toBe(false);
    expect(namedInPassage('Tamsin', '[12] Tamsin rows on.')).toBe(false);
    expect(namedInPassage('Duke Aerick', 'He bows. "Duke Aerick awaits."')).toBe(false);
    expect(namedInPassage('Duke Aerick', '"Duke Aerick awaits." You bow to Duke Aerick.')).toBe(true);
    expect(namedInPassage('Brass Owl', 'You enter the tavern.')).toBe(false);
  });

  it('is not a name when the passage also writes it lower-case', () => {
    expect(namedInPassage('Kobold', 'You meet Kobold scouts. The kobold hisses.')).toBe(false);
    expect(namedInPassage('Kobold', 'You meet Kobold. The kobolds hiss.')).toBe(true);
  });
});

describe('isConfirmed', () => {
  it('needs a second sighting, canon, a card, or a line of the player’s or a pin; a value the player set does not count', () => {
    const fresh = mergeEntity(undefined, seen(), 4);
    const own = mergeAssertions(fresh, [], { description: '', facts: ['She rows.'] }, 4, { producer: 'turn' });
    expect(isConfirmed(fresh, own)).toBe(false);
    expect(isConfirmed(mergeEntity(fresh, seen(), 10), own)).toBe(true);
    expect(isConfirmed({ ...fresh, canon: true }, own)).toBe(true);
    expect(isConfirmed({ ...fresh, cardId: 'card_1' }, own)).toBe(true);
    expect(isConfirmed(fresh, [...own, byPlayer(fresh.id, 4, { kind: 'trait', text: 'She lies.' })])).toBe(true);
    expect(
      isConfirmed(
        fresh,
        own.map((a) => ({ ...a, pinned: true })),
      ),
    ).toBe(true);
    expect(isConfirmed(fresh, setValue(fresh, own, 'mood', 'wary', 4))).toBe(false);
  });
});
