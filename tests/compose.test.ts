import { describe, expect, it } from 'vitest';
import { castIn, composeSeePrompt, isImplicit, namedCast, PROMPT_BUDGET } from '@core/image/compose';
import type { Entity } from '@core/model';

const char = (id: string, name: string, description: string, appearance?: string, aliases: string[] = []): Entity => ({
  id,
  kind: 'character',
  name,
  aliases,
  description,
  ...(appearance !== undefined && { appearance }),
  facts: [],
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});

const tamsin = char('t', 'Tamsin', 'Tamsin is a ferrywoman who poles the river.', 'grey braid, patched cloak', ['the ferrywoman']);
const bram = char('b', 'Bram', 'Bram is a toll keeper.', 'bald, red beard');
const oda = char('o', 'Oda', 'A young scribe.', 'ink-stained fingers');
const place = { ...char('p', 'Tamsin Ford', 'A crossing.'), kind: 'place' as const };
const all = [tamsin, bram, oda, place];
const scene = { location: 'river jetty', present: ['Bram'], weather: 'low mist' };
const style = 'oil painting';

describe('castIn', () => {
  it('takes the characters the brief names, in order, else the present ones', () => {
    expect(castIn('Bram glares at Tamsin', scene, all).map((e) => e.id)).toEqual(['b', 't']);
    expect(castIn('the empty jetty', scene, all).map((e) => e.id)).toEqual(['b']);
  });

  it('matches whole words and aliases, longest first', () => {
    expect(namedCast('Tamsiny waves', all)).toEqual([]);
    expect(namedCast('the ferrywoman waves', all).map((e) => e.id)).toEqual(['t']);
    const lena = char('l', 'Lena', ''),
      morrow = char('m', 'Lena Morrow', '');
    expect(namedCast('Lena Morrow sings', [lena, morrow]).map((e) => e.id)).toEqual(['m']);
  });
});

describe('composeSeePrompt', () => {
  it('replaces each name with the looks and never sends a name', () => {
    const { prompt, entityIds } = composeSeePrompt({ brief: 'Tamsin at the ferry', scene, entities: all, style });
    expect(prompt).toBe('a ferrywoman who poles the river, grey braid, patched cloak at the ferry, river jetty, low mist, oil painting');
    expect(prompt).not.toMatch(/Tamsin|Bram/);
    expect(entityIds).toEqual(['t']);
  });

  it('adds the present cast when the brief names nobody', () => {
    const { prompt, entityIds } = composeSeePrompt({ brief: 'a lantern on the jetty', scene, entities: all, style });
    expect(prompt).toBe('a lantern on the jetty, a toll keeper, bald, red beard, river jetty, low mist, oil painting');
    expect(entityIds).toEqual(['b']);
  });

  it('caps the looks at two characters, keeping the first mentions, and still hides the third name', () => {
    const { prompt, entityIds } = composeSeePrompt({ brief: 'Oda, Bram and Tamsin argue', entities: all, style });
    expect(entityIds).toEqual(['o', 'b']);
    expect(prompt).toContain('ink-stained fingers');
    expect(prompt).not.toContain('grey braid');
    expect(prompt).toContain('a ferrywoman who poles the river argue');
    expect(prompt).not.toMatch(/Oda|Bram|Tamsin/);
  });

  it('drops the second looks, then the weather, then the first looks, then cuts at a comma', () => {
    const long = (n: string) => Array.from({ length: 12 }, (_, i) => `${n} detail ${i}`).join(', ');
    const a = char('a', 'Ash', 'A smith.', long('ash')),
      b = char('b', 'Bea', 'A miller.', long('bea'));
    const input = { brief: 'Ash and Bea', scene, entities: [a, b], style };
    const { prompt } = composeSeePrompt(input);
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    expect(prompt).toContain('ash detail 11');
    expect(prompt).not.toContain('bea detail');
    expect(prompt).toContain('low mist');
    const longer = composeSeePrompt({ ...input, brief: 'Ash and Bea, ' + 'x'.repeat(PROMPT_BUDGET - prompt.length - 1) }).prompt;
    expect(longer).not.toContain('low mist');
    expect(longer).toContain('ash detail 11');
    const longest = composeSeePrompt({ ...input, brief: 'Ash and Bea, ' + Array.from({ length: 40 }, (_, i) => `tag ${i}`).join(', ') }).prompt;
    expect(longest).not.toContain('ash detail');
    expect(longest.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    expect(/tag \d+$/.test(longest)).toBe(true);
  });

  it('passes a tag list through, deduped, with commas normalised', () => {
    const { prompt } = composeSeePrompt({ brief: 'moon,  river ,, Moon, oil painting', entities: [], style });
    expect(prompt).toBe('moon, river, oil painting');
  });

  it('falls back to "a person" when the description is only the name', () => {
    const solo = char('s', 'Sol', 'Sol.', undefined);
    expect(composeSeePrompt({ brief: 'Sol sleeps', entities: [solo], style: '' }).prompt).toBe('a person sleeps');
  });
});

describe('isImplicit', () => {
  it('is a pronoun with nobody named, and not a tag list', () => {
    expect(isImplicit('she turns to face me', [])).toBe(true);
    expect(isImplicit('she turns to face me', [tamsin])).toBe(false);
    expect(isImplicit('the ferry at dusk', [])).toBe(false);
    expect(isImplicit('shelter, heron, theory', [])).toBe(false);
    expect(isImplicit('her, river, moon, mist, dusk', [])).toBe(false);
  });
});
