import { describe, expect, it } from 'vitest';
import { findTriggeredCards, lookbackWindow, parseTriggers } from '@core/cards/storyCards';
import type { StoryCard } from '@core/model/types';

const card = (name: string, triggers: string[]): StoryCard => ({ id: name, type: 'Custom', name, entry: `${name} entry`, triggers });

describe('story card triggers', () => {
  it('match case-insensitively but respect leading/trailing spaces', () => {
    const cards = [card('cat', ['cat ']), card('catalog', ['catalog'])];
    expect(findTriggeredCards(cards, ['The CAT sat.']).map((m) => m.card.name)).toEqual(['cat']);
    expect(findTriggeredCards(cards, ['A catalog.']).map((m) => m.card.name)).toEqual(['catalog']);
    // "cat " does not match "cat." (trailing space is part of the trigger)
    expect(findTriggeredCards([card('cat', ['cat '])], ['The cat.'])).toEqual([]);
  });

  it('rank by most recent hit, then frequency', () => {
    const cards = [card('A', ['alpha']), card('B', ['beta']), card('C', ['gamma'])];
    const texts = ['alpha beta', 'alpha', 'gamma', 'beta'];
    const m = findTriggeredCards(cards, texts);
    expect(m.map((x) => x.card.name)).toEqual(['B', 'C', 'A']);
    expect(m[0]!.hits).toBe(2);
    expect(m[0]!.lastHitDistance).toBe(0);
  });

  it('ignores cards with empty entries', () => {
    expect(findTriggeredCards([{ ...card('blank', ['x']), entry: '  ' }], ['x'])).toEqual([]);
  });

  it('matches a card with no triggers by its name, and one with no name never', () => {
    const cards = [card('Goldarok', []), card(' ', []), card('', [''])];
    expect(findTriggeredCards(cards, ['The dragon goldarok wakes.', ' ']).map((m) => m.card.name)).toEqual(['Goldarok']);
  });

  it('lookback window grows with the card budget', () => {
    expect(lookbackWindow(0)).toBe(4);
    expect(lookbackWindow(500)).toBe(4);
    expect(lookbackWindow(900)).toBe(9);
  });

  it('parses the trigger field without trimming', () => {
    expect(parseTriggers('Amanda,your daughter, cat ')).toEqual(['Amanda', 'your daughter', ' cat ']);
  });
});
