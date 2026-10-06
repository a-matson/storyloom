import { describe, expect, it } from 'vitest';
import { retrievalHit, scoreProbe, type SeededFact } from '../bench/recall';

const fact: SeededFact = {
  id: 'f',
  class: 'character',
  plant: ['Do', 'plant'],
  probe: ['Do', 'probe'],
  statement: 'The player has a scar on their left cheek.',
  expect: ['scar', 'cheek'],
  contradict: ['unmarked face'],
};

describe('scoreProbe', () => {
  it('honours an alias hit', () => {
    expect(scoreProbe('She knows the Scar at once.', fact)).toBe('honoured');
  });

  it('counts a contradiction even alongside a hit', () => {
    expect(scoreProbe('Your scar? No — an unmarked face, she says.', fact)).toBe('contradicted');
  });

  it('is absent on neither', () => {
    expect(scoreProbe('She shrugs and looks away.', fact)).toBe('absent');
  });
});

describe('retrievalHit', () => {
  it('reports whether the fact reached the prompt', () => {
    expect(retrievalHit('[Memory] a scar on the left cheek', fact)).toBe(true);
    expect(retrievalHit('[Memory] the ferry crossing', fact)).toBe(false);
  });
});
