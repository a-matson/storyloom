import { describe, expect, it } from 'vitest';
import { buildContext, chunkedStart, type ContextBuildInput } from '@core/context';
import type { Action, Memory, StoryCard } from '@core/model/types';
import type { Tokenizer } from '@core/text/tokenizer';

/** Deterministic tokenizer for tests: 1 token per 4 characters. */
const tok: Tokenizer = { count: (t) => (t ? Math.ceil(t.length / 4) : 0) };

let n = 0;
function act(type: Action['type'], text: string): Action {
  n += 1;
  return { id: `a${n}`, type, versions: [text], active: 0, createdAt: n };
}

function card(name: string, triggers: string[], entry: string): StoryCard {
  return { id: `c-${name}`, type: 'Character', name, entry, triggers };
}

function mem(text: string, from: number, to: number, embedding?: number[]): Memory {
  return { id: `m-${from}`, text, fromAction: from, toAction: to, actionIds: [], embedding, useCount: 0, createdAt: from };
}

function base(over: Partial<ContextBuildInput> = {}): ContextBuildInput {
  return {
    actions: [],
    plot: {},
    storyCards: [],
    entities: [],
    rankedMemories: [],
    settings: { contextLength: 400, memoryBankEnabled: true, cacheStableLayout: false, evictionChunk: 8 },
    tokenizer: tok,
    ...over,
  };
}

const long = (words: number) => Array.from({ length: words }, (_, i) => `w${i}`).join(' ');

describe('required elements', () => {
  it('always includes the last action and front memory in full', () => {
    const r = buildContext(
      base({
        actions: [act('start', 'Opening.'), act('do', '> You look around.')],
        plot: { authorsNote: long(200), plotEssentials: long(200) },
        frontMemory: 'FRONT',
      }),
    );
    expect(r.sections.find((s) => s.kind === 'lastAction')?.text).toBe('> You look around.');
    expect(r.sections.find((s) => s.kind === 'frontMemory')?.text).toBe('FRONT');
    expect(r.budget.requiredUsed).toBeLessThanOrEqual(r.budget.requiredCap);
  });

  it('caps required elements at 70% and drops lower-priority ones', () => {
    // 400 tokens → required cap 280. Author's note ~150 tok, essentials ~150 tok, instructions ~50.
    const r = buildContext(
      base({
        actions: [act('start', 'Go.')],
        plot: { authorsNote: 'a'.repeat(600), plotEssentials: 'b'.repeat(600), aiInstructions: 'c'.repeat(200), storySummary: 'd'.repeat(200) },
      }),
    );
    const kinds = r.sections.map((s) => s.kind);
    expect(kinds).toContain('authorsNote');
    expect(kinds).toContain('plotEssentials');
    const essentials = r.sections.find((s) => s.kind === 'plotEssentials')!;
    expect(essentials.trimmed).toBe(true);
    expect(r.droppedSections).toEqual(['instructions', 'storySummary']);
    expect(r.system).toBe('');
    expect(r.budget.requiredUsed).toBeLessThanOrEqual(r.budget.requiredCap);
  });

  it('script overrides take precedence over UI plot essentials and author note', () => {
    const r = buildContext(
      base({
        actions: [act('start', 'Go.')],
        plot: { plotEssentials: 'UI', authorsNote: 'UI-AN' },
        overrides: { plotEssentials: 'SCRIPT', authorsNote: 'SCRIPT-AN' },
      }),
    );
    expect(r.sections.find((s) => s.kind === 'plotEssentials')?.text).toBe('SCRIPT');
    expect(r.sections.find((s) => s.kind === 'authorsNote')?.text).toBe("[Author's note: SCRIPT-AN]");
  });
});

describe('dynamic elements', () => {
  it('splits the remainder 25/50/25 with the memory bank on', () => {
    const r = buildContext(base({ actions: [act('start', 'Go.')] }));
    expect(r.budget.cardsBudget).toBe(Math.floor(r.budget.dynamicAvailable * 0.25));
    // no cards → their budget spills into history
    expect(r.budget.historyBudget).toBe(Math.floor(r.budget.dynamicAvailable * 0.5) + r.budget.cardsBudget);
  });

  it('gives history everything after cards when the memory bank is off', () => {
    const r = buildContext(
      base({ actions: [act('start', 'Go.')], settings: { contextLength: 400, memoryBankEnabled: false, cacheStableLayout: false, evictionChunk: 8 } }),
    );
    expect(r.budget.historyBudget).toBe(r.budget.dynamicAvailable);
    expect(r.budget.memoriesBudget).toBe(0);
  });

  it('includes history newest-first and reports whether it fully fit', () => {
    const actions = [
      act('start', 'Opening paragraph here.'),
      ...Array.from({ length: 30 }, (_, i) => act('continue', `Paragraph ${i} ${long(20)}`)),
      act('do', '> You wait.'),
    ];
    const r = buildContext(base({ actions }));
    expect(r.historyFullyIncluded).toBe(false);
    expect(r.historyRange).not.toBeNull();
    expect(r.historyRange!.to).toBe(actions.length - 1);
    expect(r.historyRange!.from).toBeGreaterThan(0);
    // The newest paragraph before the last action is present, the oldest is not.
    const hist = r.sections.find((s) => s.kind === 'history')!.text;
    expect(hist).toContain('Paragraph 29');
    expect(hist).not.toContain('Opening paragraph');
    expect(r.budget.used).toBeLessThanOrEqual(r.budget.total);
  });

  it('includes the whole history when it fits and then uses no memories', () => {
    const actions = [act('start', 'Opening.'), act('continue', 'Then this.'), act('do', '> You wait.')];
    const r = buildContext(base({ actions, rankedMemories: [{ memory: mem('An old memory', 0, 6, [1]), score: 0.9 }] }));
    expect(r.historyFullyIncluded).toBe(true);
    expect(r.usedMemories).toHaveLength(0);
  });

  it('retrieves memories only when history overflows, skipping ranges still in history', () => {
    const actions = [
      act('start', 'Opening.'),
      ...Array.from({ length: 40 }, (_, i) => act('continue', `Paragraph ${i} ${long(20)}`)),
      act('do', '> You wait.'),
    ];
    const r = buildContext(
      base({
        actions,
        settings: { contextLength: 600, memoryBankEnabled: true, cacheStableLayout: false, evictionChunk: 8 },
        rankedMemories: [
          { memory: mem('Very old memory', 0, 6), score: 0.9 },
          { memory: mem('Memory of the recent past', 36, 42), score: 0.8 },
        ],
      }),
    );
    expect(r.historyFullyIncluded).toBe(false);
    expect(r.usedMemories.map((m) => m.text)).toEqual(['Very old memory']);
    expect(r.sections.find((s) => s.kind === 'memories')?.text).toBe('Memories:\nVery old memory');
  });
});

describe('story cards', () => {
  it('adds triggered cards under a World Lore header, ranked by recency then frequency', () => {
    const actions = [
      act('start', 'You meet Amanda at the gate.'),
      act('continue', 'Amanda smiles. The Fossil Garden is close.'),
      act('do', '> You walk to the Fossil Garden.'),
    ];
    const cards = [
      card('Amanda', ['Amanda'], 'Amanda is your daughter.'),
      card('Garden', ['Fossil Garden'], 'Fossil Garden is a park of petrified trees.'),
      card('Bob', ['Bob'], 'Bob is nobody.'),
    ];
    const r = buildContext(base({ actions, storyCards: cards }));
    expect(r.triggeredCards.map((m) => m.card.name)).toEqual(['Garden', 'Amanda']);
    expect(r.sections.find((s) => s.kind === 'storyCards')?.text).toBe('World Lore:\nFossil Garden is a park of petrified trees.\n\nAmanda is your daughter.');
  });

  it('drops cards that do not fit the 25% budget and reports them', () => {
    const actions = [act('start', 'Meet Amanda.'), act('do', '> You greet Amanda and Bob.')];
    const cards = [card('Amanda', ['Amanda'], long(60)), card('Bob', ['Bob'], long(60))];
    const r = buildContext(
      base({ actions, storyCards: cards, settings: { contextLength: 200, memoryBankEnabled: true, cacheStableLayout: false, evictionChunk: 8 } }),
    );
    expect(r.triggeredCards.length + r.droppedCards.length).toBe(2);
    expect(r.droppedCards.length).toBeGreaterThan(0);
    expect(r.budget.cardsUsed).toBeLessThanOrEqual(r.budget.cardsBudget);
  });
});

describe('ordering', () => {
  const actions = [
    act('start', 'Meet Amanda.'),
    ...Array.from({ length: 40 }, (_, i) => act('continue', `Amanda ${i} ${long(15)}`)),
    act('do', '> You wave at Amanda.'),
  ];
  const scene = { location: 'the mill', present: ['Amanda'], time: { day: 2, part: 'night' as const } };
  const plot = { aiInstructions: 'SYS', plotEssentials: 'ESS', storySummary: 'SUM', authorsNote: 'AN', scene };
  const cards = [card('Amanda', ['Amanda'], 'Amanda is your daughter.')];
  const memories = [{ memory: mem('Old memory', 0, 6), score: 1 }];

  it("original layout follows AI Dungeon's documented order", () => {
    const r = buildContext(base({ actions, plot, storyCards: cards, rankedMemories: memories }));
    expect(r.sections.map((s) => s.kind)).toEqual([
      'instructions',
      'plotEssentials',
      'storyCards',
      'storySummary',
      'memories',
      'history',
      'scene',
      'authorsNote',
      'lastAction',
    ]);
    expect(r.sections.filter((s) => s.cacheable).map((s) => s.kind)).toEqual(['instructions', 'plotEssentials']);
  });

  it('cache-stable layout puts history before volatile sections and marks the prefix', () => {
    const r = buildContext(
      base({
        actions,
        plot,
        storyCards: cards,
        rankedMemories: memories,
        settings: { contextLength: 400, memoryBankEnabled: true, cacheStableLayout: true, evictionChunk: 8 },
      }),
    );
    expect(r.sections.map((s) => s.kind)).toEqual([
      'instructions',
      'plotEssentials',
      'history',
      'storyCards',
      'storySummary',
      'memories',
      'scene',
      'authorsNote',
      'lastAction',
    ]);
    expect(r.sections.filter((s) => s.cacheable).map((s) => s.kind)).toEqual(['instructions', 'plotEssentials', 'history']);
    expect(r.sections.find((s) => s.kind === 'scene')?.text).toBe('[Scene: the mill · Present: Amanda · Night, day 2]');
    expect(r.body.startsWith('ESS\n\nRecent Story:\n')).toBe(true);
  });

  it('cache-stable history start only moves on chunk boundaries', () => {
    expect(chunkedStart(3, 40, 8)).toBe(8);
    expect(chunkedStart(8, 40, 8)).toBe(8);
    expect(chunkedStart(9, 40, 8)).toBe(16);
    expect(chunkedStart(0, 40, 8)).toBe(0);
    // never rounds past the end of the window
    expect(chunkedStart(39, 40, 8)).toBe(39);
    const settings = { contextLength: 400, memoryBankEnabled: true, cacheStableLayout: true, evictionChunk: 8 };
    const a = buildContext(base({ actions, settings }));
    const b = buildContext(base({ actions: [...actions, act('continue', 'A bit more.'), act('do', '> You nod.')], settings }));
    expect(a.historyRange!.from % 8).toBe(0);
    expect(b.historyRange!.from % 8).toBe(0);
  });
});
