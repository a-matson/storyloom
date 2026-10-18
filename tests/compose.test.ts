import { describe, expect, it } from 'vitest';
import { castIn, composeSeePrompt, isImplicit, namedCast, PROMPT_BUDGET } from '@core/image/compose';
import type { Entity } from '@core/model';
import { seedOf } from '@core/trace';

type Char = Entity & { appearance?: string; looks?: Record<string, string> };
const char = (id: string, name: string, description: string, appearance?: string, aliases: string[] = []): Char => ({
  id,
  kind: 'character',
  name,
  aliases,
  description,
  ...(appearance !== undefined && { appearance }),
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
const sd15 = 'sd15' as const;
const goldarok: Char = {
  ...char('g', 'Goldarok', 'Goldarok is a golden dragon, ancient and vain.'),
  looks: { species: 'dragon', build: 'massive', eyes: 'yellow', scales: 'gold' },
};

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
  it('puts the subject block first and the brief after, names replaced by nouns only', () => {
    const { prompt, entityIds, blocks } = composeSeePrompt({ brief: 'Tamsin at the ferry', scene, entities: all, style, family: sd15 });
    expect(blocks.subject).toBe('a ferrywoman who poles the river, grey braid, patched cloak');
    expect(blocks.story).toBe('a ferrywoman who poles the river at the ferry');
    expect(prompt).toBe(
      'a ferrywoman who poles the river, grey braid, patched cloak, a ferrywoman who poles the river at the ferry, river jetty, low mist, oil painting',
    );
    expect(prompt).not.toMatch(/Tamsin|Bram/);
    expect(entityIds).toEqual(['t']);
  });

  it('shows the present cast when the brief names nobody', () => {
    const { prompt, entityIds } = composeSeePrompt({ brief: 'a lantern on the jetty', scene, entities: all, style, family: sd15 });
    expect(prompt).toBe('a toll keeper, bald, red beard, a lantern on the jetty, river jetty, low mist, oil painting');
    expect(entityIds).toEqual(['b']);
  });

  it('spells looks as booru tags on sdxl and as key: value on sd15', () => {
    const brief = 'Goldarok stretching his hind legs';
    expect(composeSeePrompt({ brief, entities: [goldarok], style, family: 'sdxl' }).prompt).toBe(
      'solo, dragon, massive, gold scales, yellow eyes, a golden dragon stretching his hind legs, oil painting',
    );
    expect(composeSeePrompt({ brief, entities: [goldarok], style, family: sd15 }).blocks.subject).toBe(
      'species: dragon, build: massive, scales: gold, eyes: yellow',
    );
  });

  it('writes solo for one shown character and duo for two, sdxl only', () => {
    const vex = { ...char('v', 'Vex', 'A fox thief.'), looks: { species: 'fox', eyes: 'green' } };
    expect(composeSeePrompt({ brief: 'Goldarok and Vex', entities: [goldarok, vex], style: '', family: 'sdxl' }).blocks.subject).toBe(
      'duo, dragon, massive, gold scales, yellow eyes, a fox thief, fox, green eyes',
    );
    expect(composeSeePrompt({ brief: 'Vex', entities: [vex], style: '', family: 'sdxl' }).blocks.subject).toMatch(/^solo, /);
    expect(composeSeePrompt({ brief: 'Vex', entities: [vex], style: '', family: sd15 }).blocks.subject).not.toMatch(/solo/);
    expect(composeSeePrompt({ brief: 'a moon', entities: [], style: '', family: 'sdxl' }).prompt).toBe('a moon');
  });

  it('drops the identity clause when the looks hold species and a colour', () => {
    expect(composeSeePrompt({ brief: 'Goldarok', entities: [goldarok], style: '', family: 'sdxl' }).blocks.subject).not.toContain('golden dragon');
    const plain = { ...goldarok, looks: { species: 'dragon', eyes: 'yellow' } };
    expect(composeSeePrompt({ brief: 'Goldarok', entities: [plain], style: '', family: 'sdxl' }).blocks.subject).toBe(
      'solo, a golden dragon, dragon, yellow eyes',
    );
  });

  it('never fuses a look tag with a verb', () => {
    const { prompt } = composeSeePrompt({ brief: 'Goldarok stretching his hind legs', entities: [goldarok], style: '', family: 'sdxl' });
    expect(prompt.startsWith('solo, dragon, massive, gold scales, yellow eyes,')).toBe(true);
    expect(prompt.split(', ')).toContain('a golden dragon stretching his hind legs');
    expect(prompt).not.toMatch(/(eyes|scales|massive) stretching/);
  });

  it('noun ignores a colon', () => {
    const k = char('k', 'Kael', 'species: dragon, eyes: yellow');
    expect(composeSeePrompt({ brief: 'Kael sleeps', entities: [k], style: '', family: sd15 }).blocks.story).toBe('species: dragon sleeps');
  });

  it('caps the looks at two characters, keeping the first mentions, and still hides the third name', () => {
    const { prompt, entityIds } = composeSeePrompt({ brief: 'Oda, Bram and Tamsin argue', entities: all, style, family: sd15 });
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
    const input = { brief: 'Ash and Bea', scene, entities: [a, b], style, family: sd15 };
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

  it('gives every mention and alias the bare noun; the looks are in the subject once', () => {
    expect(composeSeePrompt({ brief: 'Bram nods, Bram smiles', entities: all, style, family: sd15 }).prompt).toBe(
      'a toll keeper, bald, red beard, a toll keeper nods, a toll keeper smiles, oil painting',
    );
    expect(composeSeePrompt({ brief: 'Tamsin hails the ferrywoman', entities: all, style: '', family: sd15 }).blocks.story).toBe(
      'a ferrywoman who poles the river hails a ferrywoman who poles the river',
    );
  });

  it('drops a possessive with the name', () => {
    expect(composeSeePrompt({ brief: "Bram's lantern swings, Bram’s hat", entities: all, style: '', family: sd15 }).blocks.story).toBe(
      'a toll keeper lantern swings, a toll keeper hat',
    );
    const minos = char('m', 'Minos', 'Minos is a giant with bare arms and chest.', 'bronze skin');
    expect(composeSeePrompt({ brief: "Minos's chest glows", entities: [minos], style: '', family: sd15 }).prompt).not.toContain("chest's");
  });

  it('passes a tag list through, deduped, with commas normalised', () => {
    const { prompt } = composeSeePrompt({ brief: 'moon,  river ,, Moon, oil painting', entities: [], style, family: sd15 });
    expect(prompt).toBe('moon, river, oil painting');
  });

  it('falls back to "a person" when the description is only the name', () => {
    const solo = char('s', 'Sol', 'Sol.', undefined);
    expect(composeSeePrompt({ brief: 'Sol sleeps', entities: [solo], style: '', family: sd15 }).prompt).toBe('a person, a person sleeps');
  });

  it('repeats a frozen look verbatim, and fixes the seed only for one character', () => {
    const frozen = { ...tamsin, look: 'a ferrywoman, grey braid', appearance: 'now shaved', looks: { hair: 'shaved' } };
    const one = composeSeePrompt({ brief: 'Tamsin at the ferry', entities: [frozen, bram], style, family: 'sdxl' });
    expect(one.prompt).toBe('solo, a ferrywoman, grey braid, a ferrywoman who poles the river at the ferry, oil painting');
    expect(one.seed).toBe(seedOf('t'));
    expect(composeSeePrompt({ brief: 'Tamsin sings', entities: [frozen], style, family: sd15 }).seed).toBe(one.seed);
    expect(composeSeePrompt({ brief: 'Tamsin and Bram', entities: [frozen, bram], style, family: sd15 }).seed).toBeUndefined();
    expect(composeSeePrompt({ brief: 'Tamsin at the ferry', entities: [tamsin], style, family: sd15 }).seed).toBeUndefined();
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
