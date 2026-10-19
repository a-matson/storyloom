import { describe, expect, it } from 'vitest';
import { fatiguedPhrases, repeatedPhrases } from '@core/text';

describe('fatiguedPhrases', () => {
  const tic = 'Her eyes glint with mischief.';
  it('a 4-gram in 3 of 10 outputs is fatigued; in 2 it is not', () => {
    expect(fatiguedPhrases([tic, 'Rain.', `Then ${tic}`, 'Wind.', `Oh, ${tic}`])).toEqual(['her eyes glint with mischief']);
    expect(fatiguedPhrases([tic, 'Rain.', `Then ${tic}`])).toEqual([]);
  });
  it('counts an output once however often it repeats', () => expect(fatiguedPhrases([`${tic} ${tic} ${tic}`, 'Rain.'])).toEqual([]));
  it('runs merge, longest first, capped at 10', () => {
    expect(fatiguedPhrases(['a b c d e', 'x a b c d e', 'a b c d e y', 'b c d e'])).toEqual(['a b c d e', 'b c d e']);
    const many = (k: number) => Array.from({ length: 12 }, (_, i) => `w${i} a${i} b${i} c${i}`).join(` zz${k} `);
    expect(fatiguedPhrases([many(1), many(2), many(3)])).toHaveLength(10);
  });
});

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
