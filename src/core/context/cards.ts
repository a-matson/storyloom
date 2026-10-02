import { compileCards, lookbackWindow, matchCards, type CardMatch } from '../cards/storyCards';
import type { Action, StoryCard } from '../model/types';
import { actionStoryText } from '../text/formatting';
import type { Tokenizer } from '../text/tokenizer';
import { HEADERS, renderSection } from './render';
import type { RenderedSections } from './types';

export interface CardsResult {
  cardsBudget: number;
  cardsUsed: number;
  triggeredCards: CardMatch[];
  droppedCards: CardMatch[];
}

/** Story cards triggered by the last few actions, best first, within 25% of the dynamic budget. */
export function selectCards(
  actions: Action[],
  lastActionIndex: number,
  storyCards: StoryCard[],
  dynamicAvailable: number,
  tokenizer: Tokenizer,
  out: RenderedSections,
  warnings: string[],
): CardsResult {
  const cardsBudget = Math.floor(dynamicAvailable * 0.25);
  const window = lookbackWindow(cardsBudget);
  const recent = lastActionIndex >= 0 ? actions.slice(Math.max(0, lastActionIndex - window + 1), lastActionIndex + 1) : [];
  const matches = matchCards(compileCards(storyCards), recent.map(actionStoryText));

  const triggeredCards: CardMatch[] = [];
  const droppedCards: CardMatch[] = [];
  let cardsUsed = matches.length ? tokenizer.count(HEADERS.storyCards) + 1 : 0;
  for (const m of matches) {
    const cost = tokenizer.count(m.card.entry) + 2;
    if (cardsUsed + cost <= cardsBudget) {
      triggeredCards.push(m);
      cardsUsed += cost;
    } else {
      droppedCards.push(m);
    }
  }
  if (triggeredCards.length === 0) cardsUsed = 0;
  if (droppedCards.length) warnings.push(`${droppedCards.length} triggered story card(s) did not fit.`);
  if (triggeredCards.length) {
    const rendered = renderSection('storyCards', triggeredCards.map((m) => m.card.entry).join('\n\n'));
    out.set('storyCards', { text: rendered, tokens: tokenizer.count(rendered), trimmed: droppedCards.length > 0 });
  }
  return { cardsBudget, cardsUsed, triggeredCards, droppedCards };
}
