import type { Entity, StoryCard } from '../model/types';
import { newId } from '../model/types';
import { knownAs, norm } from './names';

// Class, Race and custom cards describe rules or options, not a named thing in the story.
const KINDS: Record<string, Entity['kind']> = { Character: 'character', Location: 'place', Faction: 'faction' };

/** The kind of a character, location or faction card named `name`. */
export const cardKind = (cards: readonly StoryCard[], name: string): Entity['kind'] | undefined =>
  cards.map((c) => (norm(c.name) === norm(name) ? KINDS[c.type] : undefined)).find(Boolean);

/**
 * Each character, location or faction card whose name `knownAs` an entity with no card links it: the
 * entity takes the card's kind, id and entry (the card is its identity, as a promoted entity's is).
 * A card another entity holds links nothing. Untouched entities stay the same objects.
 */
export function linkCards(entities: readonly Entity[], cards: readonly StoryCard[]): Entity[] {
  let out = [...entities];
  for (const c of cards) {
    const kind = KINDS[c.type];
    const e = kind && c.name.trim() ? knownAs(out, c.name.trim()) : undefined;
    if (!kind || !e || e.cardId !== undefined || out.some((x) => x.cardId === c.id)) continue;
    out = out.map((x) => (x === e ? { ...x, kind, cardId: c.id, description: c.entry.trim() } : x));
  }
  return out;
}

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
        relations: [],
        firstSeen: atAction,
        lastSeen: atAction,
        cardId: c.id,
        canon: true,
      },
    ];
  });
}
