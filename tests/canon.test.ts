import { describe, expect, it } from 'vitest';
import { presentLine } from '@core/context/cast';
import { linkCards, seedCanonEntities } from '@core/memory/canon';
import { indexAssertions, textOf } from '@core/memory/assertionIndex';
import { mergeAssertions } from '@core/memory/assertionWrites';
import { mergeEntity, type Sighting } from '@core/memory/entities';
import { currentStates, setValue } from '@core/memory/looks';
import { foldEntities } from '@core/memory/fold';
import { createAdventureFromScenario, createBlankAdventure, newScenario } from '@core/model/scenario';
import type { Assertion, Entity, StoryCard } from '@core/model';

const card = (type: string, name: string, over: Partial<StoryCard> = {}): StoryCard => ({
  id: `card_${name}`,
  type,
  name,
  entry: `${name} entry.`,
  triggers: [name, `${name.toLowerCase()}s`],
  ...over,
});

const seen = (over: Partial<Sighting> = {}): Sighting => ({ name: 'Tamsin', kind: 'character', description: '', facts: [], ...over });

describe('canon seeding', () => {
  it('seeds characters, places and factions from cards and skips other types', () => {
    const cards = ['Character', 'Location', 'Faction', 'Class', 'Race', 'Custom', 'Spell'].map((t) => card(t, t));
    const seeded = seedCanonEntities(cards, 0);
    expect(seeded.map((e) => [e.name, e.kind])).toEqual([
      ['Character', 'character'],
      ['Location', 'place'],
      ['Faction', 'faction'],
    ]);
    expect(seeded[0]).toMatchObject({ aliases: [], description: 'Character entry.', cardId: 'card_Character', canon: true });
  });

  it('seeds from the placeholder-filled cards of a new adventure', () => {
    const s = { ...newScenario('Ferry', 'The horn sounds.'), storyCards: [card('Character', 'Ferryman', { entry: 'He ferries ${character.name}.' })] };
    const adv = createAdventureFromScenario(s, { 'character.name': 'Merav' });
    expect(adv.entities).toEqual([expect.objectContaining({ name: 'Ferryman', description: 'He ferries Merav.', canon: true, cardId: adv.storyCards[0]?.id })]);
    expect(createAdventureFromScenario(newScenario('Empty', 'x'), {}).entities).toEqual([]);
  });
});

describe('linkCards', () => {
  const found = (over: Partial<Entity> = {}): Entity => ({
    id: 'ent_g',
    kind: 'faction',
    name: 'Goldarok',
    aliases: [],
    description: '',
    relations: [],
    firstSeen: 3,
    lastSeen: 3,
    ...over,
  });

  it('re-kinds and links the entity a character card names, its entry the description', () => {
    const [e] = linkCards([found()], [card('Character', 'Goldarok', { id: 'c1' })]);
    expect(e).toMatchObject({ kind: 'character', cardId: 'c1', description: 'Goldarok entry.' });
  });

  it('folds a new name with a character card as a character, linked to the card', () => {
    const adv = createBlankAdventure('T', '');
    adv.actions = [{ id: 'a0', type: 'continue', versions: ['Smoke rises over Goldarok as you climb.'], active: 0, createdAt: 0 }];
    adv.storyCards = [card('Character', 'Goldarok', { id: 'c1', triggers: [] })];
    foldEntities(adv, [{ name: 'Goldarok', kind: 'place', description: '', facts: [] }], adv.actions[0]!.versions[0]!, { fromAction: 0, toAction: 1 });
    expect(adv.entities).toEqual([expect.objectContaining({ kind: 'character', cardId: 'c1', description: 'Goldarok entry.' })]);
  });

  it('leaves a carded entity, a held card and a class card alone', () => {
    const carded = found({ cardId: 'c0' });
    expect(linkCards([carded], [card('Character', 'Goldarok')])[0]).toBe(carded);
    const loose = found();
    expect(linkCards([loose, found({ name: 'Other', cardId: 'c1' })], [card('Character', 'Goldarok', { id: 'c1' })])[0]).toBe(loose);
    expect(linkCards([loose], [card('Class', 'Goldarok')])[0]).toBe(loose);
  });
});

describe('canon lock', () => {
  const canon = (over: Partial<Entity> = {}): Entity => ({ ...seedCanonEntities([card('Character', 'Tamsin')], 0)[0]!, ...over });

  it('model output never replaces a canon description, even an empty one', () => {
    expect(mergeEntity(canon(), seen({ description: 'A smuggler.' }), 5).description).toBe('Tamsin entry.');
    expect(mergeEntity(canon({ description: '' }), seen({ description: 'A smuggler.' }), 5).description).toBe('');
  });

  const fold = (e: Entity, own: Assertion[], said: Partial<Sighting>, at: number) =>
    mergeAssertions(e, own, { description: '', facts: [], ...said }, at, { producer: 'turn' });

  it('a locked closed key keeps its value and records one conflict per disagreement', () => {
    const e = canon({ canonKeys: ['eyes'] });
    const eyes = setValue(e, [], 'eyes', 'grey', 0);
    const once = fold(e, eyes, { state: { eyes: 'blue', location: 'the docks' } }, 7);
    expect(currentStates(once)).toEqual({ eyes: 'grey', location: 'the docks' });
    expect(once.filter((a) => a.kind === 'conflict').map(textOf)).toEqual(['the story says eyes is blue, but canon says grey']);
    expect(fold(e, once, { state: { eyes: 'Blue' } }, 9)).toHaveLength(once.length);
  });

  it('an unlocked key on a canon entity changes as usual', () => {
    const e = canon();
    const next = fold(e, setValue(e, [], 'location', 'the tower', 0), { state: { location: 'the docks' } }, 3);
    expect(currentStates(next)).toEqual({ location: 'the docks' });
    expect(next.some((a) => a.kind === 'conflict')).toBe(false);
  });

  it('a conflict is never sent', () => {
    const e = canon({ canonKeys: ['eyes'] });
    const own = fold(e, setValue(e, [], 'eyes', 'grey', 0), { state: { eyes: 'blue' }, facts: ['She sings.'] }, 7);
    expect(presentLine(e, indexAssertions(own).of(e.id), [e], true).text).not.toContain('canon says');
  });
});
