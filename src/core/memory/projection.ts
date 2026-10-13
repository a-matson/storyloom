import type { Assertion, Entity, StoryCard } from '../model/types';
import { identityText, isCurrent, textOf } from './assertionIndex';

/** Cap on a projected card's entry. [provisional] */
export const ENTITY_ENTRY_TOKENS = 120;
/** Matches the approximate tokenizer's starting ratio. */
const CHARS_PER_TOKEN = 3.9;

/**
 * The entity as a story card for the context builder; never stored, never shown in the Story cards
 * tab. Its own module because it is on the start-up path and the merge rules are not.
 */
export function projectEntity(e: Entity, as: readonly Assertion[]): StoryCard {
  const description = identityText(e, as);
  // World Lore has no headings, so an entry that does not name its subject ("A letter with no seal") gets the name.
  const named = !description || description.toLowerCase().includes(e.name.toLowerCase()) ? description : `${e.name}: ${description}`;
  // The player's current values; the story's go out with the cast lines.
  const mine = as.filter((a) => isCurrent(a) && a.producer === 'player' && (a.kind === 'state' || a.kind === 'look')).map(textOf);
  const full = [named, ...mine].filter((l) => l.trim() !== '').join('\n');
  const max = Math.floor(ENTITY_ENTRY_TOKENS * CHARS_PER_TOKEN);
  const entry = full.length <= max ? full : full.slice(0, max).replace(/\s+\S*$/, '');
  return { id: e.id, type: e.kind, name: e.name, entry, triggers: [e.name, ...e.aliases] };
}
