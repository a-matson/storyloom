import { describe, expect, it } from 'vitest';
import { paragraphs } from '@core/text';
import { guessSpeakers } from '@core/text/speakers';

const cast = [
  { name: 'Tamsin', aliases: ['the Ferrywoman'] },
  { name: 'Brann Holt', aliases: [] },
];
const guess = (text: string) => guessSpeakers(text, cast);

describe('guessSpeakers', () => {
  it.each([
    ['"Hold the rope," said Tamsin.', 'quote then said X'],
    ['"Hold the rope," Tamsin says, and pulls.', 'quote then X says'],
    ['Brann Holt said, "Hold the rope."', 'X said quote'],
    ['Brann Holt: "Hold the rope."', 'X: quote'],
    ['Tamsin leans on the pole. "Hold the rope."', 'name before the quote, same sentence'],
  ])('finds the speaker in %s (%s)', (text) => {
    expect(guess(text)).toHaveLength(1);
  });

  it('names the paragraph by its index in the blank-line split', () => {
    expect(guess('The river is high.\n\n"Hold the rope," said Tamsin.')).toEqual([{ paragraph: 1, name: 'Tamsin' }]);
    expect(paragraphs('a\n\nb\n \nc')).toEqual(['a', 'b', 'c']);
  });

  it('abstains when two known names could be the speaker', () => {
    expect(guess('Tamsin and Brann Holt shout together, "Run!"')).toEqual([]);
  });

  it('matches aliases ignoring case and reports the entity name', () => {
    expect(guess('"Hold the rope," the ferrywoman says.')).toEqual([{ paragraph: 0, name: 'Tamsin' }]);
  });

  it('ignores a name inside a quote', () => {
    expect(guess('"Tamsin will not wait," the old man says.')).toEqual([]);
    expect(guess('"Brann Holt serves me," Tamsin says.')).toEqual([{ paragraph: 0, name: 'Tamsin' }]);
  });

  it('gives nothing for narration, the player, or a name not followed by speech', () => {
    expect(guess('Tamsin poles the ferry across.')).toEqual([]);
    expect(guess('You say, "Hello."')).toEqual([]);
    expect(guess('"So you saw it," you say. Tamsin nods. "I did."')).toEqual([]);
    expect(guess('Tamsin turns toward you. "Hello."')).toEqual([{ paragraph: 0, name: 'Tamsin' }]);
    expect(guess('Tamsin\'s eyes narrow. The wind rises. "Go," someone calls.')).toEqual([]);
  });
});
