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

/** Generated triggers: shorter ones match inside unrelated words, more than this dilutes the card. [provisional] */
const MIN_TRIGGER = 4;
const MAX_TRIGGERS = 4;
/** Generic words a generator likes that would fire on nearly every passage. [provisional] */
const GENERIC_TRIGGERS = new Set([
  'spell',
  'spells',
  'magic',
  'power',
  'preparation',
  'tools',
  'life',
  'time',
  'place',
  'people',
  'world',
  'story',
  'thing',
  'things',
  'help',
  'danger',
]);

/**
 * Clean generated triggers: the name and its first word lead, then lower-cased triggers that are
 * long enough and not generic. With `source`, a trigger must occur in the story or the entry,
 * story hits first since they can fire on the next turn.
 */
export function normaliseTriggers(triggers: string[], name: string, source?: { story: string; entry: string }): string[] {
  const out = new Map<string, string>();
  const n = name.trim();
  if (n) out.set(n.toLowerCase(), n);
  const firstWord = n.split(/\s+/)[0] ?? '';
  if (firstWord.length >= MIN_TRIGGER && !/^(the|a|an|of)$/i.test(firstWord)) out.set(firstWord.toLowerCase(), firstWord);
  const story = source?.story.toLowerCase() ?? '';
  const entry = source?.entry.toLowerCase() ?? '';
  const kept = triggers
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= MIN_TRIGGER && !GENERIC_TRIGGERS.has(t) && (!source || story.includes(t) || entry.includes(t)))
    .toSorted((a, b) => Number(story.includes(b)) - Number(story.includes(a)));
  for (const t of kept) if (!out.has(t)) out.set(t, t);
  return [...out.values()].slice(0, MAX_TRIGGERS);
}

/** Hard cap from AI Dungeon; enforced in the editor, not the builder. */
export const MAX_STORY_CARDS = 5000;
