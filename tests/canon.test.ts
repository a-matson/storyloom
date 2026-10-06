import { describe, expect, it } from 'vitest';
import { seedCanonEntities } from '@core/memory/canon';
import { mergeEntity } from '@core/memory/entities';
import { rankFacts } from '@core/memory/facts';
import { createAdventureFromScenario, newScenario } from '@core/model/scenario';
import type { Entity, ExtractedEntity, StoryCard } from '@core/model';

const card = (type: string, name: string, over: Partial<StoryCard> = {}): StoryCard => ({
  id: `card_${name}`,
  type,
  name,
  entry: `${name} entry.`,
  triggers: [name, `${name.toLowerCase()}s`],
  ...over,
});

const seen = (over: Partial<ExtractedEntity> = {}): ExtractedEntity => ({ name: 'Tamsin', kind: 'character', description: '', facts: [], ...over });

describe('canon seeding', () => {
  it('seeds characters, places and factions from cards and skips other types', () => {
    const cards = ['Character', 'Location', 'Faction', 'Class', 'Race', 'Custom', 'Spell'].map((t) => card(t, t));
    const seeded = seedCanonEntities(cards, 0);
    expect(seeded.map((e) => [e.name, e.kind])).toEqual([
      ['Character', 'character'],
      ['Location', 'place'],
      ['Faction', 'faction'],
    ]);
    expect(seeded[0]).toMatchObject({ aliases: [], description: 'Character entry.', cardId: 'card_Character', canon: true, facts: [] });
  });

  it('seeds from the placeholder-filled cards of a new adventure', () => {
    const s = { ...newScenario('Ferry', 'The horn sounds.'), storyCards: [card('Character', 'Ferryman', { entry: 'He ferries ${character.name}.' })] };
    const adv = createAdventureFromScenario(s, { 'character.name': 'Merav' });
    expect(adv.entities).toEqual([expect.objectContaining({ name: 'Ferryman', description: 'He ferries Merav.', canon: true, cardId: adv.storyCards[0]?.id })]);
    expect(createAdventureFromScenario(newScenario('Empty', 'x'), {}).entities).toEqual([]);
  });
});

describe('canon lock', () => {
  const canon = (over: Partial<Entity> = {}): Entity => ({ ...seedCanonEntities([card('Character', 'Tamsin')], 0)[0]!, ...over });

  it('model output never replaces a canon description, even an empty one', () => {
    expect(mergeEntity(canon(), seen({ description: 'A smuggler.' }), 5).description).toBe('Tamsin entry.');
    expect(mergeEntity(canon({ description: '' }), seen({ description: 'A smuggler.' }), 5).description).toBe('');
  });

  it('a locked state key keeps its value and records one conflict per disagreement', () => {
    const e = canon({ state: { eyes: 'grey' }, canonKeys: ['eyes'] });
    const once = mergeEntity(e, seen({ state: { eyes: 'blue', location: 'the docks' } }), 7);
    expect(once.state).toEqual({ eyes: 'grey', location: 'the docks' });
    expect(once.facts).toEqual([
      expect.objectContaining({
        text: 'the story says eyes is blue, but canon says grey',
        conflict: true,
        claim: { key: 'eyes', value: 'blue' },
        fromAction: 7,
      }),
    ]);
    expect(mergeEntity(once, seen({ state: { eyes: 'Blue' } }), 9).facts).toHaveLength(1);
    expect(mergeEntity(once, seen({ state: { eyes: 'grey' } }), 9).facts).toHaveLength(1);
  });

  it('an unlocked key on a canon entity changes as usual', () => {
    const next = mergeEntity(canon({ state: { location: 'the tower' } }), seen({ state: { location: 'the docks' } }), 3);
    expect(next.state).toEqual({ location: 'the docks' });
    expect(next.facts.some((f) => f.conflict)).toBe(false);
  });

  it('a conflicted fact ranks with the pinned facts', () => {
    const e = mergeEntity(canon({ state: { eyes: 'grey' }, canonKeys: ['eyes'] }), seen({ state: { eyes: 'blue' }, facts: ['She sings.'] }), 7);
    const ranked = rankFacts([e], new Set(), new Set());
    expect(ranked.map((r) => r.fact.text)).toEqual(['the story says eyes is blue, but canon says grey']);
  });
});
