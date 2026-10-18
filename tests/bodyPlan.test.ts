import { describe, expect, it } from 'vitest';
import { budgetFor, composeSeePrompt } from '@core/image/compose';
import { bodyFromLine, visibleFrom } from '@core/memory/bodyPlan';
import { foldEntities } from '@core/memory/fold';
import { currentStates } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import { LOOKS_ASK } from '@core/text/prompts';
import { extractGrammar } from '@core/memory/extractJsonSchema';
import type { Entity } from '@core/model';

const goldarok = { name: 'Goldarok', aliases: [] };

describe('bodyFromLine', () => {
  it('reads the body word in a sentence that names the character', () => {
    expect(bodyFromLine('You face the quadruped dragon Goldarok.', goldarok)).toBe('quadruped');
    expect(bodyFromLine('An anthropomorphic Goldarok bows.', goldarok)).toBe('anthro');
  });

  it('ignores a body word in another sentence', () => {
    expect(bodyFromLine('Goldarok lands. A quadruped hound barks.', goldarok)).toBeUndefined();
  });
});

describe('visibleFrom', () => {
  it('keeps the visible body parts, deduped, in text order', () => {
    expect(visibleFrom('golden dragon, yellow eyes, massive, wings, claws')).toEqual(['wings', 'claws']);
    expect(visibleFrom('a horse with a hoof, a long tail and tails of silk')).toEqual(['hooves', 'tail']);
  });
});

describe('read A asks the body plan', () => {
  it('lists body in the grammar and names it in LOOKS_ASK', () => {
    expect(extractGrammar([])).toContain('"body');
    expect(LOOKS_ASK).toContain('body is the body plan');
  });
});

describe('player lines', () => {
  it('stores body: quadruped as basis player from the player line', () => {
    const adv = createBlankAdventure('T', '');
    adv.actions = [{ id: 'a0', type: 'start', versions: ['You face Goldarok, a quadruped dragon.'], active: 0, createdAt: 0 }];
    foldEntities(adv, [{ name: 'Goldarok', kind: 'character', description: 'a dragon', facts: [] }], '[0] You face Goldarok, a quadruped dragon.', {
      fromAction: 0,
      toAction: 1,
    });
    const id = adv.entities[0]?.id;
    const body = adv.assertions.find((a) => a.subject === id && a.kind === 'look' && a.key === 'body');
    expect(body).toMatchObject({ value: 'quadruped', basis: 'player', at: 0 });
    expect(currentStates(adv.assertions.filter((a) => a.subject === id))['body']).toBe('quadruped');
  });
});

type Char = Entity & { looks?: Record<string, string> };
const dragon: Char = {
  id: 'g',
  kind: 'character',
  name: 'Goldarok',
  aliases: [],
  description: 'Goldarok is a golden dragon with wings and claws.',
  looks: { species: 'dragon', body: 'quadruped', scales: 'gold' },
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
};
const see = (brief: string, family: 'sd15' | 'sdxl' = 'sdxl') => composeSeePrompt({ brief, entities: [dragon], style: '', family });

describe('composeSeePrompt body plan', () => {
  it('composes body and visible identity words in the subject block', () => {
    expect(see('Goldarok roars').blocks.subject).toBe('solo, feral, quadruped, dragon, gold scales, wings, claws');
    expect(see('Goldarok roars', 'sd15').blocks.subject).toBe('quadruped, species: dragon, scales: gold, wings, claws');
  });

  it('drops visible words first over budget', () => {
    const base = see('Goldarok roars').prompt;
    const { blocks } = see(`Goldarok roars ${'x'.repeat(budgetFor('sdxl') - base.length + 5)}`);
    expect(blocks.subject).toBe('solo, feral, quadruped, dragon, gold scales');
  });
});
