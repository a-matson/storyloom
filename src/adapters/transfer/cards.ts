import type { StoryCard } from '@core/model';
import { mapAidCards } from './aid';

/** Story cards alone, in AI Dungeon's card format: `[{ keys, entry, type, title, description }]`. */
export function exportStoryCardsJson(cards: StoryCard[]): string {
  return JSON.stringify(
    cards.map((c) => ({ keys: c.triggers.join(','), entry: c.entry, type: c.type, title: c.name, description: c.notes ?? '' })),
    null,
    2,
  );
}

export function importStoryCardsJson(json: string): { cards: StoryCard[]; warnings: string[] } {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('Story card import expects a JSON array.');
  const warnings: string[] = [];
  return { cards: mapAidCards(data, warnings), warnings };
}
