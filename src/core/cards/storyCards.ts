import type { StoryCard } from '../model/types';

/**
 * Story card trigger matching and ranking.
 *
 * Rules (from AI Dungeon's documentation):
 *  - triggers are case-insensitive substrings, sensitive to leading/trailing
 *    spaces ("cat " ≠ "cat");
 *  - a card matches when any trigger occurs in a player input or AI output
 *    within the look-back window;
 *  - cards are ranked by how recently and how frequently their triggers hit;
 *  - the look-back window is at least 4 actions, or budget/100 actions when
 *    more than 500 tokens are available for cards.
 */

export interface CardMatch {
  card: StoryCard;
  /** 0 = matched in the most recent action of the window. */
  lastHitDistance: number;
  /** Number of actions in the window that contained a trigger. */
  hits: number;
  /** Which trigger strings matched (for the context viewer). */
  triggers: string[];
}

export function lookbackWindow(cardTokenBudget: number): number {
  return cardTokenBudget > 500 ? Math.max(4, Math.floor(cardTokenBudget / 100)) : 4;
}

interface Compiled {
  card: StoryCard;
  triggers: { raw: string; lower: string }[];
}

export function compileCards(cards: StoryCard[]): Compiled[] {
  const out: Compiled[] = [];
  for (const card of cards) {
    const triggers = card.triggers.filter((t) => t.length > 0).map((raw) => ({ raw, lower: raw.toLowerCase() }));
    if (triggers.length === 0 || !card.entry.trim()) continue;
    out.push({ card, triggers });
  }
  return out;
}

/**
 * @param recentTexts texts of the actions in the look-back window, OLDEST first.
 */
export function matchCards(compiled: Compiled[], recentTexts: string[]): CardMatch[] {
  const lowered = recentTexts.map((t) => t.toLowerCase());
  const n = lowered.length;
  const matches: CardMatch[] = [];
  for (const c of compiled) {
    let hits = 0;
    let lastHitIndex = -1;
    const hitTriggers = new Set<string>();
    for (let i = 0; i < n; i++) {
      const text = lowered[i] ?? '';
      let hit = false;
      for (const t of c.triggers) {
        if (text.includes(t.lower)) {
          hit = true;
          hitTriggers.add(t.raw);
        }
      }
      if (hit) {
        hits += 1;
        lastHitIndex = i;
      }
    }
    if (hits > 0) {
      matches.push({
        card: c.card,
        lastHitDistance: n - 1 - lastHitIndex,
        hits,
        triggers: [...hitTriggers],
      });
    }
  }
  // Most recent first, then most frequent, then stable by original order.
  matches.sort((a, b) => a.lastHitDistance - b.lastHitDistance || b.hits - a.hits);
  return matches;
}

/** Convenience wrapper. */
export function findTriggeredCards(cards: StoryCard[], recentTexts: string[]): CardMatch[] {
  return matchCards(compileCards(cards), recentTexts);
}

/** Parse the comma-separated trigger field exactly as typed (spaces preserved). */
export function parseTriggers(field: string): string[] {
  return field.split(',').filter((t) => t.length > 0);
}

export function formatTriggers(triggers: string[]): string {
  return triggers.join(',');
}

/** Hard cap from AI Dungeon; enforced in the editor, not the builder. */
export const MAX_STORY_CARDS = 5000;
