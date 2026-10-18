import { describe, expect, it } from 'vitest';
import { budgetFor, composeSeePrompt, lookFor, looksOf } from '@core/image/compose';
import type { SheetFamily } from '@core/image/sheet';
import type { Entity } from '@core/model';
import * as S from '@core/schema';
import { seedOf } from '@core/trace';

type Char = Entity & { looks?: Record<string, string> };
const base: Char = {
  id: 'c',
  kind: 'character',
  name: 'Consequences',
  aliases: [],
  description: 'Consequences is a kobold.',
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
};
// The Consequences builder answers once tagified (M29-9 PR 1).
const looks = {
  species: 'kobold',
  skin: 'base burgundy red, ochre underbelly',
  scales: 'very fine',
  eyes: 'deep green',
  horns: '2 black horns',
  marks: 'pregnancy tattoo',
};
const frozen: Char = { ...base, look: looks };
const compose = (brief: string, e: Char, family: SheetFamily = 'sdxl', more: Char[] = []) =>
  composeSeePrompt({ brief, entities: [e, ...more], style: 'oil painting', family });

describe('a frozen look by key', () => {
  it('parses as a string and as a record', () => {
    for (const look of ['a kobold, red scales', { species: 'kobold' }]) expect(S.Entity.parse({ ...base, look }).look).toEqual(look);
  });

  it('freezes the looks by key, or the free text as one legacy run', () => {
    expect(looksOf({ ...base, looks })).toEqual(looks);
    expect(looksOf({ ...base, looks: {}, appearance: 'red scales' })).toEqual({ legacy: 'a kobold, red scales' });
  });

  it('composes the Consequences look within 140 characters', () => {
    const { blocks } = compose('Consequences', frozen);
    expect(blocks.subject.length).toBeLessThanOrEqual(140);
    for (const w of ['kobold', 'burgundy red', 'ochre underbelly', 'horns', 'deep green eyes']) expect(blocks.subject).toContain(w);
  });

  it('over budget keeps species, colours, horns and eyes and drops marks first', () => {
    const short = compose('Consequences walks', frozen).prompt;
    const { prompt } = compose(`Consequences walks ${'x'.repeat(budgetFor('sdxl') - short.length + 5)}`, frozen);
    expect(prompt.length).toBeLessThanOrEqual(budgetFor('sdxl'));
    for (const w of ['kobold', 'burgundy red', 'ochre underbelly', '2 black horns', 'deep green eyes']) expect(prompt).toContain(w);
    expect(prompt).not.toContain('tattoo');
  });

  it('sdxl budget keeps the second character looks that sd15 drops', () => {
    const bram: Char = { ...base, id: 'b', name: 'Bram', description: 'Bram is a toll keeper.', look: { hair: 'grey braid', wearing: 'blue coat' } };
    const brief = `Consequences and Bram walk ${'through the long and crowded market square of the old harbour town, '.repeat(2)}`;
    expect(compose(brief, frozen, 'sd15', [bram]).prompt).not.toContain('blue coat');
    const sdxl = compose(brief, frozen, 'sdxl', [bram]).prompt;
    expect(sdxl).toContain('blue coat');
    expect(sdxl.length).toBeLessThanOrEqual(budgetFor('sdxl'));
  });

  it('cuts a frozen look to the frame', () => {
    const { prompt } = compose('Consequences, feet only', frozen);
    expect(prompt).toContain('ochre underbelly');
    expect(prompt).not.toContain('eyes');
  });

  it('a legacy string look still composes verbatim, and the helper reads it whole', () => {
    const old: Char = { ...base, look: 'a kobold, red scales, his pride' };
    expect(compose('Consequences', old).blocks.subject).toContain('a kobold, red scales, his pride');
    expect(lookFor(old)).toBe('a kobold, red scales, his pride');
    expect(lookFor(frozen)).toContain('eyes: deep green');
  });
});

describe('the portrait seed', () => {
  const drawn: Char = { ...base, portraitId: 'img_c' };
  const vex: Char = { ...base, id: 'v', name: 'Vex', description: 'A fox thief.', portraitId: 'img_v' };
  const see = (brief: string, entities: Char[], more = {}) => composeSeePrompt({ brief, entities, style: '', family: 'sdxl', ...more }).seed;

  it('seeds one named character with a portrait and no frozen look', () => {
    expect(see('Consequences sleeps', [drawn, vex])).toBe(seedOf('c'));
  });

  it('does not seed a present character the brief does not name', () => {
    expect(see('the river rises', [drawn], { scene: { location: 'a cave', present: ['Consequences'] } })).toBeUndefined();
    expect(see('the river rises', [drawn], { cast: [drawn], named: [] })).toBeUndefined();
  });

  it('does not seed two characters', () => {
    expect(see('Consequences and Vex', [drawn, vex])).toBeUndefined();
  });
});
