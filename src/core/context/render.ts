import type { Scene } from '../model/types';
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

/** `Blackmore's study · Present: Lena, Morrow · Night, day 3 · Rain`, leaving out what is unknown. */
export function renderScene(scene: Scene | undefined): string {
  if (!scene) return '';
  return [
    scene.location?.trim(),
    scene.present.length ? `Present: ${scene.present.join(', ')}` : '',
    scene.time ? `${cap(scene.time.part)}, day ${scene.time.day}` : '',
    scene.weather?.trim() ? cap(scene.weather.trim()) : '',
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
