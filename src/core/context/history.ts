import type { Action } from '../model/types';
import { actionStoryText } from '../text/formatting';
import type { Tokenizer } from '../text/tokenizer';
import { HEADERS, renderSection } from './render';
import type { ContextBuildSettings, RenderedSections } from './types';

/**
 * Walk backwards from `end` (exclusive) accumulating actions until `budget`
 * tokens are used. Returns the start index of the fitting window.
 */
export function historyWindowStart(actions: Action[], end: number, budget: number, tokenizer: Tokenizer): { start: number; tokens: number } {
  let used = 0;
  let start = end;
  for (let i = end - 1; i >= 0; i--) {
    const a = actions[i];
    const t = a ? actionStoryText(a) : '';
    if (!t) {
      start = i;
      continue;
    }
    const cost = tokenizer.count(t) + 1;
    if (used + cost > budget) break;
    used += cost;
    start = i;
  }
  return { start, tokens: used };
}

/** Round a history start up to the next chunk boundary so the prefix only moves every `chunk` actions. */
export function chunkedStart(start: number, end: number, chunk: number): number {
  if (chunk <= 1 || start <= 0) return start;
  const rounded = Math.ceil(start / chunk) * chunk;
  return rounded < end ? rounded : start;
}

export interface HistoryResult {
  historyBudget: number;
  historyUsed: number;
  historyRange: { from: number; to: number } | null;
  historyFullyIncluded: boolean;
}

/** Recent actions before the last one, newest kept; half the dynamic budget plus what cards left (all of it without a memory bank). */
export function selectHistory(
  actions: Action[],
  end: number,
  dynamicAvailable: number,
  cards: { cardsBudget: number; cardsUsed: number },
  settings: ContextBuildSettings,
  tokenizer: Tokenizer,
  out: RenderedSections,
  warnings: string[],
): HistoryResult {
  const historyBudget = settings.memoryBankEnabled
    ? Math.floor(dynamicAvailable * 0.5) + (cards.cardsBudget - cards.cardsUsed)
    : dynamicAvailable - cards.cardsUsed;
  const header = tokenizer.count(HEADERS.history) + 1;
  const result: HistoryResult = { historyBudget, historyUsed: 0, historyRange: null, historyFullyIncluded: end <= 0 };
  if (end <= 0) return result;
  if (historyBudget <= header) {
    warnings.push('No room for story history after required elements and cards.');
    return result;
  }

  let { start } = historyWindowStart(actions, end, historyBudget - header, tokenizer);
  result.historyFullyIncluded = start === 0;
  if (!result.historyFullyIncluded && settings.cacheStableLayout) start = chunkedStart(start, end, settings.evictionChunk);
  const parts = actions
    .slice(start, end)
    .map(actionStoryText)
    .filter((t) => t !== '');
  if (parts.length) {
    const rendered = renderSection('history', parts.join('\n\n'));
    result.historyRange = { from: start, to: end };
    result.historyUsed = tokenizer.count(rendered);
    out.set('history', { text: rendered, tokens: result.historyUsed, trimmed: !result.historyFullyIncluded });
  }
  return result;
}
