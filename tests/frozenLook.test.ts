import { describe, expect, it } from 'vitest';
import { composeSeePrompt, lookFor, looksOf, PROMPT_BUDGET } from '@core/image/compose';
import type { Entity } from '@core/model';
import * as S from '@core/schema';

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
const compose = (brief: string, e: Char) => composeSeePrompt({ brief, entities: [e], style: 'oil painting', family: 'sdxl' });

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
    const long = `Consequences walks ${'slowly through the long and crowded market square of the old harbour town at dusk, '.repeat(2)}`.slice(0, 172);
    const { prompt } = compose(long, frozen);
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    for (const w of ['kobold', 'burgundy red', 'ochre underbelly', '2 black horns', 'deep green eyes']) expect(prompt).toContain(w);
    expect(prompt).not.toContain('tattoo');
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
