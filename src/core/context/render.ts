import { heldBy, itemsHere, MAX_ITEMS, YOU } from '../memory/items';
import type { Entity, Scene } from '../model/types';
import type { ContextSection, SectionKind } from './types';

export const HEADERS = {
  storyCards: 'World Lore:',
  storySummary: 'Story Summary:',
  memories: 'Memories:',
  history: 'Recent Story:',
  facts: 'Established facts:',
  // Not "World Lore:", so a projected entity never reads as a hand-written card.
  entityCards: 'Known entities:',
} as const satisfies Partial<Record<SectionKind, string>>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * `Blackmore's study · Present: Lena, Morrow · You hold: Horn · Here: the ledger, Key (Lena) · Rain`,
 * leaving out what is unknown; the item lists come from `entities` too. An old saved `time` is not sent.
 * ponytail: a third-person player's items stay under their name, not `You hold`; map it when one plays so.
 */
export function renderScene(scene: Scene | undefined, entities: readonly Entity[] = []): string {
  const held = heldBy(entities, YOU)
    .slice(0, MAX_ITEMS)
    .map((e) => e.name);
  const here = scene ? itemsHere(scene, entities) : [];
  return [
    scene?.location?.trim(),
    scene && scene.present.length > 0 ? `Present: ${scene.present.join(', ')}` : '',
    held.length ? `You hold: ${held.join(', ')}` : '',
    here.length ? `Here: ${here.join(', ')}` : '',
    scene?.weather?.trim() ? cap(scene.weather.trim()) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function renderSection(kind: SectionKind, content: string): string {
  // Bracketed asides read as instructions, not narration.
  if (kind === 'authorsNote') return `[Author's note: ${content}]`;
  if (kind === 'retryNote') return `[Note: keep to this: ${content}]`;
  if (kind === 'scene') return `[Scene: ${content}]`;
  const header = (HEADERS as Partial<Record<SectionKind, string>>)[kind];
  return header ? `${header}\n${content}` : content;
}

/** Flatten sections (excluding the system section) into the user-turn text. */
export function renderBody(sections: ContextSection[]): string {
  return sections
    .filter((s) => s.kind !== 'instructions')
    .map((s) => s.text)
    .join('\n\n');
}
