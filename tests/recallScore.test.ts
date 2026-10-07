import { describe, expect, it } from 'vitest';
import * as S from '@core/schema';
import type { Adventure } from '@core/model';
import { FACTS, FILLERS, isOrig, OPENING, retrievalHit, scenarioJson, scoreProbe, type SeededFact } from '../bench/recall';
import { sliceHistory, stripAdventure, turnEnds, type RecallHistory } from '../bench/recallHistory';
import { makeAdventure } from './fixtures/adventure';

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

describe('the recorded history', () => {
  // Opening, then AI/player alternating: story turns end at actions 4, 6, 8 and 10.
  const played = (): Adventure => {
    const a = makeAdventure({ actions: 9, cards: 2, memories: 2, embeddingDim: 2 });
    return {
      ...a,
      actions: a.actions.map((x) => ({ ...x, speakers: [{ paragraph: 0, name: 'Merav' }] })),
      plot: { ...a.plot, storySummary: 'so far', scene: { present: ['Merav'] } },
      scriptState: { ...a.scriptState, __summaryAt: 4, __entitiesAt: 6 },
      entities: [{ id: 'e', kind: 'character', name: 'Merav', aliases: [], description: '', facts: [], state: {}, relations: [], firstSeen: 1, lastSeen: 3 }],
    };
  };
  const history = (a: Adventure): RecallHistory => ({
    format: 'storyloom-recall-history',
    version: 1,
    recordedAt: '',
    facts: [],
    turnEnds: turnEnds(a.actions),
    adventure: stripAdventure(a),
  });

  it('keeps only creation state', () => {
    const s = S.Adventure.parse(stripAdventure(played()));
    expect(s.memories).toEqual([]);
    expect(s.plot.storySummary ?? s.plot.scene).toBeUndefined();
    expect(Object.keys(s.scriptState).filter((k) => k.startsWith('__'))).toEqual([]);
    expect(s.actions.some((x) => x.speakers)).toBe(false);
    // The two Location cards seed canon entities again; the extracted character is gone.
    expect(s.entities.map((e) => [e.canon, e.facts.length])).toEqual([
      [true, 0],
      [true, 0],
    ]);
  });

  it('cuts at a story turn boundary and refuses a depth past the recording', () => {
    const h = history(played());
    expect(h.turnEnds).toEqual([4, 6, 8, 10]);
    const d2 = sliceHistory(h, 2, 11);
    expect(d2.actions.map((x) => x.type).slice(-2)).toEqual(['do', 'continue']);
    expect(d2.actions).toHaveLength(6);
    expect(d2.settings.model.seed).toBe(11);
    expect(() => sliceHistory(h, 5)).toThrow(/4 story turns/);
  });
});

describe('retrievalHit', () => {
  it('reports whether the fact reached the prompt', () => {
    expect(retrievalHit('[Memory] a scar on the left cheek', fact)).toBe(true);
    expect(retrievalHit('[Memory] the ferry crossing', fact)).toBe(false);
  });
});
