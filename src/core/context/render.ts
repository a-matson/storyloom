import type { ContextSection, SectionKind } from './types';

export const HEADERS = {
  storyCards: 'World Lore:',
  storySummary: 'Story Summary:',
  memories: 'Memories:',
  history: 'Recent Story:',
} as const satisfies Partial<Record<SectionKind, string>>;

export function renderSection(kind: SectionKind, content: string): string {
  if (kind === 'authorsNote') return `[Author's note: ${content}]`;
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
