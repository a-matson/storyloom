import type { Entity, StoryCard } from '../model/types';
import { newId } from '../model/types';

// Class, Race and custom cards describe rules or options, not a named thing in the story.
const KINDS: Record<string, Entity['kind']> = { Character: 'character', Location: 'place', Faction: 'faction' };

/**
 * One canon entity per character, location or faction card. The card stays the canonical text
 * (it reaches the prompt when triggered), so the entity carries no facts and holds the card by id.
 * Triggers are not aliases: they are context keywords ("Merav,rope" on the Ferryman), and as
 * aliases they would fold other characters into this one.
 */
export function seedCanonEntities(cards: readonly StoryCard[], atAction: number): Entity[] {
  return cards.flatMap((c) => {
    const kind = KINDS[c.type];
    const name = c.name.trim();
    if (!kind || !name) return [];
    return [
      {
        id: newId('ent_'),
        kind,
        name,
        aliases: [],
        description: c.entry.trim(),
        facts: [],
        state: {},
        relations: [],
        firstSeen: atAction,
        lastSeen: atAction,
        cardId: c.id,
        canon: true,
      },
    ];
  });
}
