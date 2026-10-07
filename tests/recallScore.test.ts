import { describe, expect, it } from 'vitest';
import * as S from '@core/schema';
import { FACTS, FILLERS, isOrig, OPENING, retrievalHit, scenarioJson, scoreProbe, type SeededFact } from '../bench/recall';

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

describe('the fact table', () => {
  const keys = (f: SeededFact) => [...f.expect, ...f.contradict].map((k) => k.toLowerCase());

  it('has 8 facts per class, typed cards and at least 4 seeding cards', () => {
    for (const c of ['character', 'place', 'canon']) expect(FACTS.filter((f) => f.class === c)).toHaveLength(8);
    const cards = FACTS.filter((f) => f.plant[0] === 'card');
    expect(cards.every((f) => f.card?.type)).toBe(true);
    expect(cards.filter((f) => ['Character', 'Location', 'Faction'].includes(f.card?.type ?? '')).length).toBeGreaterThanOrEqual(4);
  });

  // A shared keyword would score one fact's probe on another; the original 12 predate the rule.
  it('keeps every new fact apart from the others, the probes, the fillers and the opening', () => {
    const texts = [OPENING, ...FILLERS.map(([, t]) => t), ...FACTS.map((f) => f.probe[1])].map((t) => t.toLowerCase());
    const clashes = FACTS.flatMap((f) => [
      ...FACTS.filter((g) => f !== g && !(isOrig(f) && isOrig(g))).flatMap((g) =>
        keys(f)
          .filter((k) => g.statement.toLowerCase().includes(k))
          .map((k) => `${f.id}:${k} in ${g.id}`),
      ),
      ...(isOrig(f) ? [] : f.expect.filter((k) => texts.some((t) => t.includes(k))).map((k) => `${f.id}:${k} in a turn`)),
    ]);
    expect(clashes).toEqual([]);
  });

  it('builds a scenario the importer accepts', () => {
    const s = S.Scenario.parse(scenarioJson());
    expect(s.storyCards).toHaveLength(FACTS.filter((f) => f.card).length);
    expect(s.plot.plotEssentials).toContain('1142');
  });
});

describe('retrievalHit', () => {
  it('reports whether the fact reached the prompt', () => {
    expect(retrievalHit('[Memory] a scar on the left cheek', fact)).toBe(true);
    expect(retrievalHit('[Memory] the ferry crossing', fact)).toBe(false);
  });
});
