import { describe, expect, it } from 'vitest';
import { attributeSpeakers, entityNamedIn, matchEntity, mergeEntities, mergeEntity, namedInPassage } from '@core/memory/entities';
import { isConfirmed } from '@core/memory/facts';
import { appearanceOf, currentStates, setState } from '@core/memory/looks';
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

  it('ends the current state of a key when a new value arrives, and ignores the same value', () => {
    const first = mergeEntity(undefined, seen({ state: { location: 'the tavern' } }), 4);
    const next = mergeEntity(first, seen({ state: { location: 'the docks' } }), 23);
    expect(next.state).toEqual({});
    expect(currentStates(next)).toEqual({ location: 'the docks' });
    expect(next.facts.map((f) => [f.text, f.kind, f.until])).toEqual([
      ['location: the tavern', 'state', 23],
      ['location: the docks', 'state', undefined],
    ]);
    const again = mergeEntity(next, seen({ state: { location: 'The docks' } }), 30);
    expect(again.facts).toHaveLength(2);
    expect(again.lastSeen).toBe(30);
  });

  it('lets a state fact override a legacy map value of the same key', () => {
    const legacy: Entity = { ...mergeEntity(undefined, seen(), 1), state: { location: 'the tavern', mood: 'calm' } };
    expect(currentStates(mergeEntity(legacy, seen({ state: { location: 'the docks' } }), 5))).toEqual({ location: 'the docks', mood: 'calm' });
    expect(mergeEntity(legacy, seen({ state: { location: 'the tavern' } }), 5).facts).toEqual([]);
  });

  it('dedupes facts by containment, keeping the longer, but never rewrites a player or pinned fact', () => {
    const first = mergeEntity(undefined, seen({ facts: ['She has a scar.'] }), 1);
    const longer = mergeEntity(first, seen({ facts: ['She has a scar on her left cheek.'] }), 4);
    expect(longer.facts.map((f) => [f.id, f.text, f.fromAction])).toEqual([[first.facts[0]?.id, 'She has a scar on her left cheek.', 4]]);
    expect(mergeEntity(longer, seen({ facts: ['she has a scar'] }), 6).facts).toHaveLength(1);
    const pinned: Entity = { ...first, facts: first.facts.map((f) => ({ ...f, pinned: true })) };
    expect(mergeEntity(pinned, seen({ facts: ['She has a scar on her left cheek.'] }), 4).facts.map((f) => f.text)).toEqual([
      'She has a scar.',
      'She has a scar on her left cheek.',
    ]);
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

  it('sets the free-text appearance once and never appends to it', () => {
    const first = mergeEntity(undefined, seen({ appearance: 'Grey hair.' }), 1);
    expect(first.appearance).toBe('Grey hair.');
    expect(mergeEntity(first, seen(), 2).appearance).toBe('Grey hair.');
    const next = mergeEntity(first, seen({ appearance: 'Grey hair and a patched blue coat.' }), 5);
    expect(next.appearance).toBe('Grey hair.');
    expect(next.facts).toEqual([]);
    expect(mergeEntity(undefined, seen(), 1)).not.toHaveProperty('appearance');
  });

  it('reads looks from current look-key states in a fixed order, else the free text', () => {
    const e = mergeEntity(undefined, seen({ appearance: 'Grey hair.', state: { wearing: 'a blue coat', eyes: 'green', mood: 'wary' } }), 1);
    expect(appearanceOf(e)).toBe('eyes: green, wearing: a blue coat');
    const changed = mergeEntity(e, seen({ state: { wearing: 'a red cloak' } }), 3);
    expect(appearanceOf(changed)).toBe('eyes: green, wearing: a red cloak');
    expect(appearanceOf(mergeEntity(undefined, seen({ appearance: 'Grey hair.' }), 1))).toBe('Grey hair.');
  });

  it('never replaces a canon appearance, but fills a missing one', () => {
    const canon: Entity = { ...mergeEntity(undefined, seen(), 1), canon: true };
    const filled = mergeEntity(canon, seen({ appearance: 'Grey hair.' }), 2);
    expect(filled.appearance).toBe('Grey hair.');
    expect(mergeEntity(filled, seen({ appearance: 'Grey hair and a patched blue coat.' }), 3).appearance).toBe('Grey hair.');
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
    expect(merged.facts.map((f) => f.text)).toEqual(['mood: wary', 'She owes the guild.', 'She has a scar.']);
    expect(currentStates(merged)).toEqual({ mood: 'wary', location: 'the docks' });
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
  it('is a story card triggered by name and aliases, with the map states no state fact overrides', () => {
    const base = mergeEntity(undefined, seen({ aliases: ['ferrywoman'], description: 'A ferrywoman.', state: { mood: 'wary' } }), 1);
    const e = { ...base, state: { location: 'the docks', mood: 'calm' } };
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

describe('setState', () => {
  it("writes the player's value to the map and ends the model's current value for the key", () => {
    const e = mergeEntity(undefined, seen({ state: { location: 'the docks', mood: 'calm' } }), 3);
    const next = { ...e, ...setState(e, 'location', 'the tavern') };
    expect(currentStates(next)).toEqual({ location: 'the tavern', mood: 'calm' });
    expect(next.facts.find((f) => f.key === 'location')?.until).toBe(3);
    expect(currentStates({ ...next, ...setState(next, 'location', '') })).toEqual({ mood: 'calm' });
  });
});

describe('isConfirmed', () => {
  it('needs a second sighting, canon, a card, or a player-touched fact', () => {
    const fresh = mergeEntity(undefined, seen({ facts: ['She rows.'] }), 4);
    expect(isConfirmed(fresh)).toBe(false);
    expect(isConfirmed(mergeEntity(fresh, seen(), 10))).toBe(true);
    expect(isConfirmed({ ...fresh, canon: true })).toBe(true);
    expect(isConfirmed({ ...fresh, cardId: 'card_1' })).toBe(true);
    expect(isConfirmed({ ...fresh, facts: [{ id: 'f', text: 'She lies.', fromAction: 4, source: 'player' }] })).toBe(true);
    expect(isConfirmed({ ...fresh, facts: fresh.facts.map((f) => ({ ...f, pinned: true })) })).toBe(true);
  });
});
