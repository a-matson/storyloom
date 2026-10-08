import { describe, expect, it } from 'vitest';
import { buildContext, type ContextBuildInput } from '@core/context';
import type { Action, Entity } from '@core/model/types';
import type { Tokenizer } from '@core/text/tokenizer';

/** 1 token per 4 characters, as in contextBuilder.test.ts. */
const tok: Tokenizer = { count: (t) => (t ? Math.ceil(t.length / 4) : 0) };
let id = 0;
const act = (type: Action['type'], text: string): Action => ({ id: `a${++id}`, type, versions: [text], active: 0, createdAt: id });
const long = (words: number) => Array.from({ length: words }, (_, i) => `w${i}`).join(' ');

function entity(name: string, description: string, facts: string[], state: Record<string, string> = {}): Entity {
  return {
    id: `e-${name}`,
    kind: 'character',
    name,
    aliases: [],
    description,
    facts: facts.map((text, i) => ({ id: `f-${name}-${i}`, text, fromAction: i, source: 'memory' as const })),
    state,
    relations: [],
    firstSeen: 0,
    lastSeen: 1,
  };
}

const actions = [act('start', 'The mill.'), ...Array.from({ length: 30 }, (_, i) => act('continue', `${i} ${long(20)}`)), act('do', '> You call for Orrin.')];
const scene = { location: 'the mill', present: ['Lena'], time: { day: 2, part: 'night' as const } };
const lena = entity('Lena', 'Lena keeps the mill.', ['She has blue eyes.', 'She owes Orrin money.'], { location: 'the loft' });
const orrin = entity('Orrin', 'Orrin is a ferryman.', ['He fears water.']);
const tamsin = entity('Tamsin', 'Tamsin is far away.', ['She left.']);
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
const kinds = new Set(['scene', 'facts', 'entityCards']);
const structured = (r: ReturnType<typeof buildContext>) => r.sections.filter((s) => kinds.has(s.kind));

describe('structured elements', () => {
  it('sends present and mentioned entities as facts and cards after history, never cached', () => {
    for (const stable of [false, true]) {
      const r = buildContext(input(2000, stable));
      const order = r.sections.map((s) => s.kind);
      expect(order.slice(order.indexOf('history') + 1)).toEqual(['entityCards', 'facts', 'scene', 'authorsNote', 'lastAction']);
      expect(structured(r).every((s) => !s.cacheable)).toBe(true);
      expect(r.sections.find((s) => s.kind === 'facts')?.text).toBe(
        'Established facts:\nLena: She owes Orrin money.\nLena: She has blue eyes.\nOrrin: He fears water.',
      );
      expect(r.sections.find((s) => s.kind === 'entityCards')?.text).toBe('Known entities:\nLena keeps the mill.\nlocation: the loft\n\nOrrin is a ferryman.');
      expect(r.usedEntityIds).toEqual([lena.id, orrin.id]);
      expect(r.budget.structuredUsed).toBe(structured(r).reduce((sum, s) => sum + s.tokens, 0));
      expect(r.budget.structuredUsed).toBeLessThanOrEqual(r.budget.structuredBudget);
    }
  });

  it('keeps the scene and drops entity cards first at a tight cap', () => {
    // 10% of 450 = 45: scene 13 + facts 24 fit; the smallest card needs 12 of the 8 left.
    const r = buildContext(input(450));
    expect(r.budget.structuredBudget).toBe(45);
    expect(structured(r).map((s) => s.kind)).toEqual(['facts', 'scene']);
    expect(r.usedFacts).toHaveLength(3);
    expect(r.budget.structuredUsed).toBeLessThanOrEqual(45);
  });

  it('never goes over the share and returns what it leaves to the dynamic budget', () => {
    const r = buildContext({ ...input(400), settings: { ...settings(400), structuredShare: 0.05 } });
    expect(r.budget.structuredBudget).toBe(20);
    expect(structured(r).map((s) => s.kind)).toEqual(['scene']);
    expect(r.budget.dynamicAvailable).toBe(r.budget.total - r.budget.requiredUsed - r.budget.structuredUsed);
  });

  it('sends facts but no card for an entity a story card already covers', () => {
    const card = { id: 'c-orrin', type: 'Character', name: 'Orrin', entry: 'The hand-written Orrin.', triggers: ['Orrin'] };
    const r = buildContext({ ...input(2000), storyCards: [card] });
    expect(r.sections.find((s) => s.kind === 'entityCards')?.text).not.toContain('ferryman');
    expect(r.sections.find((s) => s.kind === 'facts')?.text).toContain('Orrin: He fears water.');
    expect(r.triggeredCards.map((m) => m.card.id)).toEqual(['c-orrin']);
  });

  it('sends nothing for an entity seen in one range only', () => {
    const r = buildContext({ ...input(2000), entities: [{ ...lena, lastSeen: 0 }, orrin] });
    expect(r.sections.find((s) => s.kind === 'facts')?.text).toBe('Established facts:\nOrrin: He fears water.');
    expect(r.usedEntityIds).toEqual([orrin.id]);
  });

  it('with entity facts off, sends the scene and only pinned facts, no cards', () => {
    const pinned = { ...orrin, facts: [...orrin.facts, { id: 'f-pin', text: 'He is bald.', fromAction: 2, source: 'player' as const, pinned: true }] };
    const r = buildContext({ ...input(2000), entities: [lena, pinned], settings: { ...settings(2000), pinnedFactsOnly: true } });
    expect(structured(r).map((s) => s.kind)).toEqual(['facts', 'scene']);
    expect(r.sections.find((s) => s.kind === 'facts')?.text).toBe('Established facts:\nOrrin: He is bald.');
  });
});
