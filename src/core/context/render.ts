import { indexAssertions } from '../memory/assertionIndex';
import { heldBy, itemsHere, MAX_ITEMS, YOU } from '../memory/items';
import { sceneNames } from '../memory/names';
import type { Entity, Scene } from '../model/types';
import type { ContextSection, SectionKind } from './types';

export const HEADERS = {
  storyCards: 'World Lore:',
  storySummary: 'Story Summary:',
  memories: 'Memories:',
  history: 'Recent Story:',
} as const satisfies Partial<Record<SectionKind, string>>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * `Blackmore's house · You: the study · Day 2, evening · Present: Lena, Morrow · Group: the Harrows (3) · In the basement: Weever · Here: the ledger, Key (Lena) · You hold: Horn · Rain`,
 * leaving out what is unknown; the item lists come from `entities` too. `Present` is who is with you (in your room, `zone`); one in another room (`zones`) is under it.
 * `through`: the way the last move came, `the kitchen (through the hall)`.
 * ponytail: a third-person player's items stay under their name, not `You hold`; map it when one plays so.
 */
export function renderScene(stored: Scene | undefined, entities: readonly Entity[] = [], ix = indexAssertions([]), through?: string): string {
  const scene = stored && sceneNames(stored, entities);
  const held = heldBy(entities, ix, YOU)
    .slice(0, MAX_ITEMS)
    .map((e) => e.name);
  const here = scene ? itemsHere(scene, entities, ix) : [];
  const rooms = new Map<string, string[]>();
  for (const p of scene?.present ?? []) {
    const room = scene?.zones?.[p] ?? '';
    rooms.set(room, [...(rooms.get(room) ?? []), p]);
  }
  const withYou = rooms.get('') ?? [];
  const groups = scene?.groups ?? [];
  rooms.delete('');
  return [
    scene?.location?.trim() && (through ? `${scene.location.trim()} (through ${through})` : scene.location.trim()),
    scene?.zone ? `You: ${scene.zone}` : '',
    // `formatTime` inlined: importing `clock.ts` would pull it into start-up.
    scene?.time ? `Day ${scene.time.day}, ${scene.time.part}` : '',
    withYou.length ? `Present: ${withYou.join(', ')}` : '',
    groups.length ? `Group: ${groups.map((g) => (g.count === undefined ? g.id : `${g.id} (${g.count})`)).join(', ')}` : '',
    ...[...rooms].map(([room, who]) => `In ${room}: ${who.join(', ')}`),
    here.length ? `Here: ${here.join(', ')}` : '',
    held.length ? `You hold: ${held.join(', ')}` : '',
    scene?.weather?.trim() ? cap(scene.weather.trim()) : '',
    scene?.tension ? `Tension: ${scene.tension}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function renderSection(kind: SectionKind, content: string): string {
  // Bracketed asides read as instructions, not narration.
  if (kind === 'authorsNote') return `[Author's note: ${content}]`;
  if (kind === 'retryNote') return `[Note: keep to this: ${content}]`;
  if (kind === 'scene') return `[Scene: ${content}]`;
  if (kind === 'rules') return `[Rules: ${content}]`;
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
