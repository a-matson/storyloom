import { describe, expect, it } from 'vitest';
import { applyPlaceholders, findPlaceholders } from '@core/text/placeholders';
import { formatPlayerInput, trimUnfinishedSentence } from '@core/text/formatting';
import { guessTemplate, renderTemplate } from '@core/text/templates';
import { createApproxTokenizer, trimToTokens } from '@core/text/tokenizer';
import { createAdventureFromScenario, newScenario, placeholderQuestions } from '@core/model/scenario';
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
      storyCards: [{ id: 'c', type: 'Character', name: 'Hero', entry: '${character.name} carries a lute.', triggers: ['${character.name}'] }],
      createdAt: 0,
      updatedAt: 0,
    };
    expect(placeholderQuestions(s).map((q) => q.key)).toEqual(['character.name', 'What is your class?']);
    const a = createAdventureFromScenario(s, { 'character.name': 'Peach', 'What is your class?': 'bard' });
    expect(a.actions[0]!.versions[0]).toBe('You are Peach the bard.');
    expect(a.plot.plotEssentials).toBe('Peach is brave.');
    expect(a.storyCards[0]!.triggers).toEqual(['Peach']);
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
  it('trims to a token budget at a word boundary', () => {
    const t = createApproxTokenizer();
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const out = trimToTokens(text, 20, t);
    expect(t.count(out)).toBeLessThanOrEqual(20);
    expect(out.endsWith(' ')).toBe(false);
    expect(text.startsWith(out)).toBe(true);
  });
});
