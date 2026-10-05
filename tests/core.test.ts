import { describe, expect, it } from 'vitest';
import { applyPlaceholders, findPlaceholders } from '@core/text/placeholders';
import { formatPlayerInput, trimUnfinishedSentence } from '@core/text/formatting';
import { guessTemplate, renderTemplate, templateMatches } from '@core/text/templates';
import { createApproxTokenizer, createExactTokenizer, trimToTokens } from '@core/text/tokenizer';
import { createAdventureFromScenario, missingAnswers, newScenario, placeholderQuestions, scenarioSummary } from '@core/model/scenario';
import { childAt, coverIds, newOption, withChild } from '@core/model/scenarioTypes';
import * as S from '@core/schema';
import type { Scenario } from '@core/model/types';

describe('placeholders', () => {
  it('finds unique placeholders in order and labels character.name', () => {
    const q = findPlaceholders(['You are ${character.name}, ${What do you do?}.', 'Again ${character.name}']);
    expect(q).toEqual([
      { key: 'character.name', label: "Enter your character's name…", uses: 2 },
      { key: 'What do you do?', label: 'What do you do?', uses: 1 },
    ]);
  });
  it('substitutes every occurrence, case-sensitively', () => {
    expect(applyPlaceholders('${a} ${a} ${A}', { a: 'x' })).toBe('x x ${A}');
  });
  it('flows through scenario → adventure', () => {
    const s: Scenario = {
      id: 's',
      title: 'T',
      description: '',
      tags: [],
      type: 'story',
      prompt: 'You are ${character.name} the ${What is your class?}.',
      plot: { plotEssentials: '${character.name} is brave.' },
      storyCards: [
        {
          id: 'c',
          type: 'Character',
          name: 'Hero',
          entry: '${character.name} carries a lute.',
          triggers: ['${character.name}'],
          notes: 'A ${What is your class?}.',
        },
      ],
      createdAt: 0,
      updatedAt: 0,
    };
    expect(placeholderQuestions(s).map((q) => q.key)).toEqual(['character.name', 'What is your class?']);
    expect(missingAnswers(placeholderQuestions(s), { 'character.name': ' Peach ', 'What is your class?': '  ' })).toEqual(['What is your class?']);
    expect(missingAnswers(placeholderQuestions(s), {})).toEqual(['character.name', 'What is your class?']);
    const a = createAdventureFromScenario(s, { 'character.name': ' Peach ', 'What is your class?': 'bard\n' });
    expect(a.actions[0]!.versions[0]).toBe('You are Peach the bard.');
    expect(a.plot.plotEssentials).toBe('Peach is brave.');
    expect(a.storyCards[0]!.entry).toBe('Peach carries a lute.');
    expect(a.storyCards[0]!.triggers).toEqual(['Peach']);
    expect(a.storyCards[0]!.notes).toBe('A bard.');
  });
});

describe('multiple choice tree', () => {
  it('finds and replaces nested options without touching the input', () => {
    const root: Scenario = { ...newScenario('Root'), type: 'multipleChoice' };
    const a = { ...newOption(root), title: 'A', type: 'multipleChoice' as const };
    const b = { ...newOption(a), title: 'B' };
    root.options = [a, newOption(root)];
    a.options = [b];
    expect(a.parentId).toBe(root.id);
    expect(childAt(root, [a.id, b.id])?.title).toBe('B');
    expect(childAt(root, [])).toBe(root);
    expect(childAt(root, ['missing'])).toBeUndefined();
    const next = withChild(root, [a.id, b.id], { ...b, title: 'B2' });
    expect(childAt(next, [a.id, b.id])?.title).toBe('B2');
    expect(b.title).toBe('B');
    expect(next.options?.[1]).toBe(root.options[1]);
    expect(S.Scenario.parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });

  it('lists every cover in the tree with the owner its blob is keyed under', () => {
    const root: Scenario = { ...newScenario('Root'), type: 'multipleChoice', coverId: 'img_root' };
    const a = { ...newOption(root), coverId: 'img_a' };
    root.options = [a, newOption(root)];
    expect(coverIds(root)).toEqual([
      [root.id, 'img_root'],
      [a.id, 'img_a'],
    ]);
    expect(coverIds(newScenario('No cover'))).toEqual([]);
  });
});

describe('scripts into the adventure', () => {
  it('copies the played leaf scripts, not the root ones, and nothing when all four are empty', () => {
    const root: Scenario = { ...newScenario('Root'), type: 'multipleChoice', scripts: { library: 'var root = 1;', input: '', context: '', output: '' } };
    const leaf: Scenario = { ...newOption(root), scripts: { library: '', input: '', context: '', output: 'modifier(text)' } };
    root.options = [leaf];
    // startScenario hands `createAdventureFromScenario` the leaf the player reached.
    expect(createAdventureFromScenario(leaf, {}).scripts).toEqual({ library: '', input: '', context: '', output: 'modifier(text)' });
    expect(createAdventureFromScenario({ ...leaf, scripts: { library: '', input: '', context: ' ', output: '' } }, {}).scripts).toBeUndefined();
    expect(createAdventureFromScenario(newScenario('Plain'), {}).scripts).toBeUndefined();
  });
});

describe('newScenario', () => {
  it('is a valid blank story scenario without placeholders', () => {
    const s = newScenario();
    expect(S.Scenario.safeParse(s).success).toBe(true);
    expect(s.type).toBe('story');
    expect(placeholderQuestions(s)).toEqual([]);
    expect(s.plot.aiInstructions).toMatch(/narrator/);
  });
});

describe('scenarioSummary', () => {
  it('counts each placeholder once across prompt and cards, cards, branches and non-empty scripts', () => {
    const s: Scenario = {
      ...newScenario('S', 'You are ${character.name}.'),
      storyCards: [
        { id: 'a', type: 'NPC', name: 'a', entry: '${character.name} and ${Rival?}', triggers: [] },
        { id: 'b', type: 'NPC', name: 'b', entry: 'b', triggers: [] },
      ],
      scripts: { library: '', input: 'x', context: ' ', output: 'y' },
    };
    expect(scenarioSummary(s)).toEqual({ type: 'story', placeholders: 2, cards: 2, branches: 0, scripts: 2 });
    expect(scenarioSummary({ ...newScenario(), type: 'multipleChoice', options: [newScenario(), newScenario()] })).toMatchObject({ branches: 2, scripts: 0 });
  });
});

describe('player input formatting', () => {
  it('formats Do and Say like AI Dungeon', () => {
    expect(formatPlayerInput('do', 'go north')).toBe('> You go north.');
    expect(formatPlayerInput('do', 'You go north!')).toBe('> You go north!');
    expect(formatPlayerInput('say', 'How far?')).toBe('> You say "How far?"');
    expect(formatPlayerInput('story', 'The wind shifts.')).toBe('The wind shifts.');
    expect(formatPlayerInput('do', 'draw the sword', { thirdPerson: { enabled: true, name: 'Merav' } })).toBe('> Merav draw the sword.');
  });
  it('trims unfinished sentences', () => {
    expect(trimUnfinishedSentence('She turns. The door opens and')).toBe('She turns.');
    expect(trimUnfinishedSentence('Complete sentence.')).toBe('Complete sentence.');
    expect(trimUnfinishedSentence('no punctuation at all')).toBe('no punctuation at all');
  });
  it.each([
    ['dangling opening quote', 'He turns.\n\n"', 'He turns.'],
    ['open dialogue fragment', 'He turns. "Wait, I', 'He turns.'],
    ['comma-closed fragment', 'He turns.\n\n"…still,"', 'He turns.'],
    ['sentence inside open dialogue', 'She nods. "Run. Now, before', 'She nods.'],
    ['closed dialogue', 'She nods. "Run." The rider', 'She nods. "Run."'],
    ['interrupted speech', '"I don—" He stops and', '"I don—"'],
    ['curly quotes', 'She nods. “Run.” The rider', 'She nods. “Run.”'],
    ['ellipsis', 'It fades… and then', 'It fades…'],
    ['one sentence only', 'The door opens and', 'The door opens and'],
  ])('trims a length cut: %s', (_, out, want) => {
    expect(trimUnfinishedSentence(out, 'length')).toBe(want);
  });
  it('keeps stop-terminated output but drops an unmatched trailing quote', () => {
    expect(trimUnfinishedSentence('She turns. The door opens and', 'eos')).toBe('She turns. The door opens and');
    expect(trimUnfinishedSentence('She turns.\n\n"', 'stop')).toBe('She turns.');
    expect(trimUnfinishedSentence('She says, “', 'stop')).toBe('She says,');
    expect(trimUnfinishedSentence('"Go."', 'stop')).toBe('"Go."');
  });
});

describe('templates', () => {
  it('renders ChatML and Llama 3 with stop strings', () => {
    const c = renderTemplate('chatml', 'SYS', 'USER', 'She');
    expect(c.prompt).toBe('<|im_start|>system\nSYS<|im_end|>\n<|im_start|>user\nUSER<|im_end|>\n<|im_start|>assistant\nShe');
    expect(c.stop).toContain('<|im_end|>');
    const l = renderTemplate('llama3', '', 'USER');
    expect(l.prompt.startsWith('<|begin_of_text|><|start_header_id|>user')).toBe(true);
  });
  it('guesses templates from model names', () => {
    expect(guessTemplate('Harbinger-24B-Q4_K_M.gguf')).toBe('chatml');
    expect(guessTemplate('Nova-70B-Llama-3.3.Q4_K_M.gguf')).toBe('llama3');
    expect(guessTemplate('Equinox-31B-Q4.gguf')).toBe('gemma');
  });
  it('matches a server template only when it renders the same bytes', async () => {
    const chatml = (ms: { role: string; content: string }[]) =>
      Promise.resolve(ms.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n');
    expect(await templateMatches('chatml', chatml)).toBe(true);
    expect(await templateMatches('llama3', chatml)).toBe(false);
  });
});

describe('tokenizer', () => {
  it('estimates and calibrates', () => {
    const t = createApproxTokenizer();
    const text = 'The caravan has been walking the Salt Road for nine days.';
    const before = t.count(text);
    expect(before).toBeGreaterThan(8);
    expect(before).toBeLessThan(20);
    t.calibrate(text, 30); // pretend the real tokenizer is much denser
    expect(t.count(text)).toBeGreaterThan(before);
  });
  it('swaps estimates for exact counts on resolve and caches them', async () => {
    const calls: string[] = [];
    const t = createExactTokenizer({ count: () => 100 }, async (text) => (calls.push(text), text.length));
    expect(t.count('abc')).toBe(100);
    expect(t.count('abc')).toBe(100);
    expect(await t.resolve?.()).toBe(true);
    expect(t.count('abc')).toBe(3);
    expect(await t.resolve?.()).toBe(false);
    expect(calls).toEqual(['abc']);
  });
  it('keeps estimating when /tokenize fails', async () => {
    const t = createExactTokenizer({ count: () => 7 }, () => Promise.reject(new Error('down')));
    t.count('x');
    expect(await t.resolve?.()).toBe(false);
    expect(t.count('x')).toBe(7);
  });
  it('trims to a token budget at a word boundary', () => {
    const t = createApproxTokenizer();
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const out = trimToTokens(text, 20, t);
    expect(t.count(out)).toBeLessThanOrEqual(20);
    expect(out.endsWith(' ')).toBe(false);
    expect(text.startsWith(out)).toBe(true);
  });
});
