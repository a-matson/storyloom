import { describe, expect, it } from 'vitest';
import { tagify } from '@core/memory/tagify';
import { placeTag } from '@core/image/tags';

describe('tagify', () => {
  it('keeps the clauses that look and drops what the character feels or means', () => {
    expect(tagify('2 black horns, his pride and joy')).toEqual(['2 black horns']);
    expect(tagify('deep green, big and trusting')).toEqual(['deep green']);
    expect(tagify('pregnancy tattoo that indicates he is expecting')).toEqual(['pregnancy tattoo']);
  });

  it('turns a "<parts> are <colour>" sentence into "<colour> <first part>"', () => {
    expect(tagify('base burgundy red; underbelly, inner thighs, soles, underarms are ochre')).toEqual(['base burgundy red', 'ochre underbelly']);
    expect(tagify('his scales are emerald')).toEqual(['emerald scales']);
  });

  it('falls back to the first clause when nothing looks, never empty', () => {
    expect(tagify('very fine, his skin is soft to touch')).toEqual(['very fine']);
    expect(tagify('fox')).toEqual(['fox']);
    expect(tagify('his pride and joy')).toEqual(['his pride and joy']);
    expect(tagify('  ')).toEqual([]);
  });

  it('keeps a pair of looks joined by "and" and caps a clause at six words', () => {
    expect(tagify('black and white stripes')).toEqual(['black and white stripes']);
    expect(tagify('a long red scarf wound twice round the neck')).toEqual(['a long red scarf wound twice']);
  });

  it('leaves place tags as they were', () => {
    expect(placeTag('Halven is a grey stone keep, cold and old.')).toBe('grey stone keep');
  });
});
