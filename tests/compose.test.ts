import { describe, expect, it } from 'vitest';
import { composeSeePrompt, isImplicit, namedCast, PROMPT_BUDGET, subjectsIn } from '@core/image/compose';
import { withLooks } from '@core/memory';
import type { Assertion, Entity } from '@core/model';
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

describe('subjectsIn', () => {
  it('takes the characters the brief names, in order, else the present ones', () => {
    expect(subjectsIn('Bram glares at Tamsin', scene, all).map((e) => e.id)).toEqual(['b', 't']);
    expect(subjectsIn('the empty jetty', scene, all).map((e) => e.id)).toEqual(['b']);
  });

  it('puts named characters before items and factions, and borrows nobody when the brief names any entity', () => {
    const horn = { ...char('h', 'Horn', 'A brass horn.'), kind: 'item' as const };
    expect(subjectsIn('the Horn sounds for Bram', scene, [...all, horn]).map((e) => e.id)).toEqual(['b', 'h']);
    expect(subjectsIn('rain over Tamsin Ford', scene, all)).toEqual([]);
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

describe('the state block', () => {
  const state = (key: string, value: string, at: number, seen?: false): Assertion => ({
    id: `as_${key}${at}`,
    subject: 'g',
    producer: 'turn',
    at,
    basis: seen === false ? 'inferred' : 'stated',
    since: at,
    kind: 'state',
    key,
    value,
    ...(seen === false && { seen }),
  });
  const brief = 'Goldarok rests in the cave';
  const see = (as: Assertion[], from: number) =>
    composeSeePrompt({ brief, entities: [{ ...goldarok, states: withLooks(goldarok, as, from).states }], style: '', family: 'sdxl' });

  it('puts the state block after the subject and before the brief', () => {
    const { prompt, blocks } = see([state('mood', 'submissive', 4), state('posture', 'lying', 6, false)], 5);
    expect(blocks.state).toBe('lying, on side, submissive expression');
    expect(prompt).toBe('solo, dragon, massive, gold scales, yellow eyes, lying, on side, submissive expression, a golden dragon rests in the cave');
  });

  it('uses a posture proposal from the last read when there is no current posture', () => {
    expect(see([state('posture', 'lying', 6, false)], 5).blocks.state).toBe('lying, on side');
    expect(see([state('posture', 'sitting', 2), state('posture', 'lying', 6, false)], 5).blocks.state).toBe('sitting');
  });

  it('ignores an older proposal', () => {
    expect(see([state('posture', 'lying', 2, false)], 5).blocks.state).toBe('');
  });

  it('holds an item by its noun', () => {
    const horn = { ...char('h', 'Horn', 'The Horn is a brass horn.'), kind: 'item' as const };
    const g = { ...goldarok, holds: ['h'] };
    expect(composeSeePrompt({ brief: 'Goldarok', entities: [g, horn], style: '', family: 'sdxl' }).blocks.state).toBe('holding a brass horn');
  });

  it('drops the state block before the weather when over budget', () => {
    const a = { ...char('a', 'Ash', 'A smith.', Array.from({ length: 12 }, (_, i) => `ash detail ${i}`).join(', ')), states: { mood: 'grim' } };
    const fit = 'Ash, ' + 'x'.repeat(PROMPT_BUDGET - composeSeePrompt({ brief: 'Ash', scene, entities: [a], style, family: sd15 }).prompt.length + 2);
    const { prompt } = composeSeePrompt({ brief: fit, scene, entities: [a], style, family: sd15 });
    expect(prompt).not.toContain('grim');
    expect(prompt).toContain('low mist');
  });
});

describe('places and non-characters', () => {
  const company = { ...char('c', 'Goldarok', 'Goldarok is a mercenary company in gilded armour.'), kind: 'faction' as const };
  const vex: Char = { ...char('v', 'Vex', 'Vex is a fox thief.'), look: 'a fox thief, green eyes' };
  const halven = { ...char('k', 'Halven', 'Halven is a stone keep on a cliff, rain'), kind: 'place' as const };
  const mire = { ...char('m', 'Ashmire', 'Ashmire is where the Duke of Vael rules.'), kind: 'place' as const };
  const atHalven = { location: 'Halven', present: ['Vex'], weather: 'dusk' };

  it('a brief naming a faction takes no present character looks or seed', () => {
    const input = { brief: 'Goldarok marches on the gate', scene: atHalven, entities: [company, vex, halven], style, family: 'sdxl' as const };
    const { prompt, seed, entityIds } = composeSeePrompt(input);
    expect(seed).toBeUndefined();
    expect(prompt).not.toMatch(/fox|green eyes|solo/);
    expect(entityIds).toEqual(['c']);
  });

  it('a faction or item in the brief composes as its identity noun, not its name', () => {
    const horn = { ...char('h', 'Horn of Ur', 'The Horn of Ur is a brass horn.'), kind: 'item' as const };
    const { blocks } = composeSeePrompt({ brief: 'Goldarok raises Horn of Ur', entities: [company, horn], style: '', family: sd15 });
    expect(blocks.subject).toBe('a mercenary company in gilded armour, a brass horn');
    expect(blocks.story).toBe('a mercenary company in gilded armour raises a brass horn');
  });

  it('a place composes as its first visual clause', () => {
    expect(composeSeePrompt({ brief: 'Vex waits', scene: atHalven, entities: [vex, halven], style: '', family: sd15 }).blocks.scene).toBe(
      'stone keep on a cliff, dusk',
    );
  });

  it('a place with no visual clause sends no location tag', () => {
    const at = { location: 'Ashmire', present: [], weather: 'dusk' };
    expect(composeSeePrompt({ brief: 'a lantern', scene: at, entities: [mire], style: '', family: sd15 }).blocks.scene).toBe('dusk');
    expect(composeSeePrompt({ brief: 'a lantern', scene: { location: 'Harrows', present: [] }, entities: [], style: '', family: sd15 }).blocks.scene).toBe('');
  });

  it('no proper noun reaches the prompt', () => {
    const entities = [...all, company, vex, halven, mire];
    const briefs = ['Goldarok storms Halven', 'Vex flees Ashmire', "Bram's lantern at Tamsin Ford", 'Tamsin and Goldarok in Halven'];
    for (const s of [scene, atHalven, { location: 'Ashmire', present: ['Vex'] }])
      for (const brief of briefs) {
        const { prompt } = composeSeePrompt({ brief, scene: s, entities, style, family: 'sdxl' });
        for (const e of entities) expect(prompt).not.toContain(e.name);
      }
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
