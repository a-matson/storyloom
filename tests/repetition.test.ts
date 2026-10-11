import { describe, expect, it } from 'vitest';
import { repeatedPhrases } from '@core/text';

describe('repeatedPhrases', () => {
  it('finds nothing without previous outputs', () => {
    expect(repeatedPhrases('She sets the cup on the metal table.', [])).toEqual([]);
  });

  it('merges overlapping 4-grams into one run, ignoring case and punctuation', () => {
    const prev = ['He leans over the metal table, slowly.'];
    expect(repeatedPhrases('Then, Leans over the METAL table! again', prev)).toEqual(['leans over the metal table']);
  });

  it('does not report a 3-word overlap', () => {
    expect(repeatedPhrases('the metal table creaks', ['on the metal table'])).toEqual([]);
  });

  it('checks every previous output, longest first, capped at 10', () => {
    const prev = ['one two three four', 'five six seven eight nine'];
    expect(repeatedPhrases('five six seven eight nine x one two three four', prev)).toEqual(['five six seven eight nine', 'one two three four']);
    const many = Array.from({ length: 12 }, (_, i) => `w${i} a${i} b${i} c${i}`);
    expect(repeatedPhrases(many.join(' zz '), many)).toHaveLength(10);
  });
});
