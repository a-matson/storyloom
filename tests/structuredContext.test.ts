import { describe, expect, it } from 'vitest';
import { buildContext as build, nowLines, type ContextBuildInput } from '@core/context';
import { newSecret } from '@core/memory/secrets';
import type { Action, Assertion, EntityFact, LegacyEntity } from '@core/model/types';
import type { Tokenizer } from '@core/text/tokenizer';
import { derived } from './fixtures/assertions';

const buildContext = (i: ContextBuildInput) => build(derived(i));

/** 1 token per 4 characters, as in contextBuilder.test.ts. */
const tok: Tokenizer = { count: (t) => (t ? Math.ceil(t.length / 4) : 0) };
let id = 0;
const act = (type: Action['type'], text: string): Action => ({ id: `a${++id}`, type, versions: [text], active: 0, createdAt: id });
const long = (words: number) => Array.from({ length: words }, (_, i) => `w${i}`).join(' ');
const fact = (name: string, i: number, text: string, over: Partial<EntityFact> = {}): EntityFact => ({
  id: `f-${name}-${i}`,
  text,
  fromAction: i,
  source: 'memory',
  ...over,
});

function entity(name: string, description: string, facts: EntityFact[], state: Record<string, string> = {}): LegacyEntity & { facts: EntityFact[] } {
  return { id: `e-${name}`, kind: 'character', name, aliases: [], description, facts, state, relations: [], firstSeen: 0, lastSeen: 1 };
}

const actions = [act('start', 'The mill.'), ...Array.from({ length: 30 }, (_, i) => act('continue', `${i} ${long(20)}`)), act('do', '> You call for Orrin.')];
const scene = { location: 'the mill', present: ['Lena'], weather: 'cold rain at night' };
const lena = entity(
  'Lena',
  'Lena keeps the mill, and has for years.',
  [
    fact('Lena', 0, 'She has blue eyes.'),
    fact('Lena', 1, 'eyes: blue', { kind: 'state', key: 'eyes', value: 'blue' }),
    fact('Lena', 2, 'mood: wary', { kind: 'state', key: 'mood', value: 'wary' }),
    fact('Lena', 3, 'poisoned', { kind: 'effect', value: 'poisoned', cause: { kind: 'item', text: 'the green wine' } }),
    fact('Lena', 4, 'distrusts you', { kind: 'relationship' }),
    fact('Lena', 5, 'She hums.', { source: 'player' }),
  ],
  { location: 'the loft' },
);
const orrin = entity('Orrin', 'Orrin is a ferryman.', [
  fact('Orrin', 0, 'He fears water.'),
  fact('Orrin', 1, 'mood: calm', { kind: 'state', key: 'mood', value: 'calm' }),
]);
const tamsin = entity('Tamsin', 'Tamsin is far away.', [fact('Tamsin', 0, 'She left.')]);
const settings = (contextLength: number, cacheStableLayout = false) => ({ contextLength, memoryBankEnabled: true, cacheStableLayout, evictionChunk: 8 });
const input = (contextLength: number, cacheStableLayout = false): ContextBuildInput => ({
  actions,
  plot: { authorsNote: 'AN', scene },
  storyCards: [],
  entities: [lena, orrin, tamsin],
  rankedMemories: [],
  settings: settings(contextLength, cacheStableLayout),
  tokenizer: tok,
});
const kinds = new Set(['rules', 'scene', 'cast']);
const structured = (r: ReturnType<typeof buildContext>) => r.sections.filter((s) => kinds.has(s.kind));
const cast = (r: ReturnType<typeof buildContext>) => r.sections.find((s) => s.kind === 'cast')?.text;

describe('nowLines', () => {
  it('is the scene line and the cast lines the prompt sends for who is here', () => {
    const i = derived(input(4000));
    const r = build(i);
    const now = nowLines(i);
    expect(r.sections.find((s) => s.kind === 'scene')?.text).toContain(now.scene);
    // Orrin is only named by the text, so the cast has him after who is here.
    expect(now.lines.map((l) => l.text)).toEqual(cast(r)?.split('\n').slice(0, 1));
  });
});

describe('structured elements', () => {
  it('sends the scene, then a now-line for who is present and an identity for who is named, never cached', () => {
    for (const stable of [false, true]) {
      const r = buildContext(input(4000, stable));
      const order = r.sections.map((s) => s.kind);
      expect(order.slice(order.indexOf('history') + 1)).toEqual(['scene', 'cast', 'authorsNote', 'lastAction']);
      expect(structured(r).every((s) => !s.cacheable)).toBe(true);
      expect(cast(r)).toBe(['Lena (keeps the mill): wary; poisoned — the green wine; distrusts you; She hums.', 'Orrin (a ferryman).'].join('\n'));
      expect(r.usedEntityIds).toEqual([lena.id, orrin.id]);
      expect(r.usedFacts.map((f) => f.factId)).toEqual(['as_f-Lena-2', 'as_f-Lena-3', 'as_f-Lena-4', 'as_f-Lena-5']);
      expect(r.budget.structuredUsed).toBe(structured(r).reduce((sum, s) => sum + s.tokens, 0));
    }
  });

  it('sends states in key order, four words each, no location and no look but wearing', () => {
    const states = { wearing: 'a long grey wool cloak', mood: 'wary', hair: 'red', location: 'the loft', posture: 'sitting', condition: 'very tired' };
    const r = buildContext({ ...input(4000), entities: [entity('Lena', 'Lena keeps the mill.', [], states)] });
    expect(cast(r)).toBe('Lena (keeps the mill): sitting, very tired, wary, wearing a long grey wool.');
  });

  it('sends nothing for an absent entity, its pins included, and never a `Name:` line', () => {
    const pinned = { ...tamsin, facts: [...tamsin.facts, fact('Tamsin', 1, 'She owes Lena.', { pinned: true })] };
    expect(cast(buildContext({ ...input(4000), entities: [lena, orrin, pinned] }))).not.toContain('Tamsin');
    const bare = entity('Mara', '', [fact('Mara', 0, 'mood: sullen', { kind: 'state', key: 'mood', value: 'sullen' })]);
    const r = buildContext({ ...input(4000), entities: [bare, orrin], plot: { scene: { present: ['Mara'] } } });
    expect(cast(r)).toBe('Mara — sullen.\nOrrin (a ferryman).');
    expect(cast(r)).not.toMatch(/^\w+:/m);
  });

  it('sends the identity of an item here and one you hold, after who is present and before who is named', () => {
    const item = (name: string, description: string, state: Record<string, string> = {}) => ({
      ...entity(name, description, [], state),
      kind: 'item' as const,
    });
    const amulet = item('Amulet', 'Amulet of the drowned queen, cold to touch.', { holder: 'you' });
    const lamp = item('Lamp', 'Lamp that never goes out.');
    const r = buildContext({ ...input(4000), entities: [lena, orrin, amulet, lamp], plot: { scene: { ...scene, items: ['Lamp'] } } });
    expect(r.sections.find((s) => s.kind === 'scene')?.text).toBe('[Scene: the mill · Present: Lena · Here: Lamp · You hold: Amulet · Cold rain at night]');
    expect(cast(r)?.split('\n').slice(1)).toEqual(['Lamp (that never goes out).', 'Amulet (of the drowned queen).', 'Orrin (a ferryman).']);
  });

  it('gives a present character its stance to another present one', () => {
    const toOrrin = { ...lena, facts: [fact('Lena', 9, 'owes him money', { kind: 'relationship', key: 'Orrin' })] };
    const r = buildContext({ ...input(4000), entities: [toOrrin, orrin], plot: { scene: { ...scene, present: ['Orrin', 'Lena'] } } });
    expect(cast(r)).toBe('Orrin (a ferryman): calm.\nLena (keeps the mill). With Orrin: owes him money.');
  });

  it('says what a present character missed while history still holds it', () => {
    const presence = [
      { at: 0, present: ['e-Lena'] },
      { at: 2, present: [] },
      { at: 6, present: ['e-Lena'] },
    ];
    const plot = { scene, presence };
    // M13-9: a clause that quoted the gap's memory put the secret in the absent character's line.
    const secret = { id: 'm', text: 'Orrin confessed the SECRET.', fromAction: 2, toAction: 6, actionIds: [], useCount: 0, createdAt: 0 };
    const line = cast(buildContext({ ...input(4000), plot, rankedMemories: [{ memory: secret, score: 1 }] }))?.split('\n')[0];
    expect(line).toMatch(/^Lena \(keeps the mill\): .*; was away for part of the scene and does not know what was said then; She hums\.$/);
    expect(line).not.toContain('SECRET');
    // Two away gaps read the same: one clause.
    const twice = [...presence, { at: 7, present: [] }, { at: 8, present: ['e-Lena'] }];
    expect(cast(buildContext({ ...input(4000), plot: { scene, presence: twice } }))?.match(/was away/g)).toHaveLength(1);
    expect(cast(buildContext({ ...input(4000), plot: { scene } }))).not.toContain('away');
    // A short context's history starts after action 5: the gap is a memory's business.
    expect(cast(buildContext({ ...input(400), plot }))).not.toContain('away');
  });

  it('reads the same whatever order the entities come in', () => {
    const a = buildContext(input(4000));
    const b = buildContext({ ...input(4000), entities: [tamsin, orrin, lena] });
    expect(cast(b)).toBe(cast(a));
  });

  it('never passes 200 tokens and drops whole lines from the end', () => {
    const crowd = Array.from({ length: 40 }, (_, i) =>
      entity(`P${i}`, `P${i} is a guard of the long hall.`, [fact(`P${i}`, 0, `mood: tense ${i}`, { kind: 'state', key: 'mood', value: `tense ${i}` })]),
    );
    const r = buildContext({ ...input(40000), entities: crowd, plot: { scene: { present: crowd.map((e) => e.name) } } });
    expect(r.budget.structuredBudget).toBe(200);
    expect(r.budget.structuredUsed).toBeLessThanOrEqual(200);
    const lines = cast(r)?.split('\n') ?? [];
    expect(lines.length).toBeLessThan(40);
    expect(lines.at(-1)).toBe(`P${lines.length - 1} (a guard of the long hall): tense ${lines.length - 1}.`);
  });

  it('never goes over the share and returns what it leaves to the dynamic budget', () => {
    const r = buildContext({ ...input(400), settings: { ...settings(400), structuredShare: 0.05 } });
    expect(r.budget.structuredBudget).toBe(20);
    expect(structured(r).map((s) => s.kind)).toEqual(['scene', 'cast']);
    expect(cast(r)).toBe('Orrin (a ferryman).');
    expect(r.budget.structuredUsed).toBeLessThanOrEqual(20);
    expect(r.budget.dynamicAvailable).toBe(r.budget.total - r.budget.requiredUsed - r.budget.structuredUsed);
  });

  it('gives no identity to an entity a story card already covers', () => {
    const card = { id: 'c-orrin', type: 'Character', name: 'Orrin', entry: 'The hand-written Orrin.', triggers: ['Orrin'] };
    const r = buildContext({ ...input(4000), storyCards: [card], plot: { scene: { present: ['Orrin'] } } });
    expect(cast(r)).toBe('Orrin — calm.');
    expect(r.triggeredCards.map((m) => m.card.id)).toEqual(['c-orrin']);
  });

  it('sends nothing for an entity seen in one range only', () => {
    const r = buildContext({ ...input(4000), entities: [lena, { ...orrin, lastSeen: 0 }] });
    expect(cast(r)).not.toContain('Orrin');
    expect(r.usedEntityIds).toEqual([lena.id]);
  });

  it('with entity facts off, sends the scene and only the pins of who is here or named', () => {
    const pinned = { ...orrin, facts: [...orrin.facts, fact('Orrin', 2, 'He is bald.', { source: 'player', pinned: true })] };
    const away = { ...tamsin, facts: [fact('Tamsin', 1, 'She owes Lena.', { pinned: true })] };
    const r = buildContext({ ...input(4000), entities: [lena, pinned, away], settings: { ...settings(4000), pinnedFactsOnly: true } });
    expect(structured(r).map((s) => s.kind)).toEqual(['scene', 'cast']);
    expect(cast(r)).toBe('Lena (keeps the mill): She hums.\nOrrin (a ferryman): He is bald.');
  });
});

describe('secrets', () => {
  const withSecrets = (...secrets: Assertion[]) => {
    const i = derived(input(4000));
    return build({ ...i, assertions: [...i.assertions, ...secrets] });
  };
  const lines = (r: ReturnType<typeof buildContext>) =>
    cast(r)
      ?.split('\n')
      .filter((l) => l.startsWith('Secret')) ?? [];

  it('secret line names who does not know, after the cast', () => {
    const r = withSecrets(newSecret(3, 'You sold the keys.', []));
    expect(cast(r)?.split('\n').at(-1)).toBe('Secret, known only to you: You sold the keys. Lena and Orrin do not know it.');
  });

  it('no line when everyone here knows', () => {
    expect(lines(withSecrets(newSecret(3, 'You sold the keys.', ['e-Lena', 'e-Orrin'])))).toEqual([]);
  });

  it('a mentioned outsider counts, and an absent one does not', () => {
    expect(lines(withSecrets(newSecret(3, 'You sold the keys.', ['e-Lena'])))).toEqual([
      'Secret, known only to you and Lena: You sold the keys. Orrin does not know it.',
    ]);
  });

  it('counts an unconfirmed character the scene names', () => {
    const i = derived({ ...input(4000), entities: [lena, { ...orrin, lastSeen: 0 }], plot: { scene: { ...scene, present: ['Lena', 'Orrin'] } } });
    const r = build({ ...i, assertions: [...i.assertions, newSecret(3, 'You sold the keys.', ['e-Lena'])] });
    expect(cast(r)).not.toContain('Orrin (');
    expect(lines(r)).toEqual(['Secret, known only to you and Lena: You sold the keys. Orrin does not know it.']);
  });

  it('marks a memory over the secret with who knows it', () => {
    const i = derived(input(400));
    const memory = { id: 'm', text: 'You confessed.', fromAction: 2, toAction: 6, actionIds: [], useCount: 0, createdAt: 0 };
    const r = build({ ...i, assertions: [...i.assertions, newSecret(3, 'You sold the keys.', ['e-Lena'])], rankedMemories: [{ memory, score: 1 }] });
    expect(r.sections.find((s) => s.kind === 'memories')?.text).toBe('Memories:\n(known only to you and Lena) You confessed.');
  });

  it('sends the two most recently marked', () => {
    const r = withSecrets(newSecret(1, 'One.', []), newSecret(5, 'Five.', []), newSecret(3, 'Three.', []));
    expect(lines(r).map((l) => l.split(': ')[1])).toEqual(['Five. Lena and Orrin do not know it.', 'Three. Lena and Orrin do not know it.']);
  });
});
