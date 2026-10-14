import { describe, expect, it } from 'vitest';
import { presentLine } from '@core/context/cast';
import { gapsOf, WITNESS_TOKENS, witnessClause } from '@core/context/witness';
import type { Action, Assertion, Entity, Memory } from '@core/model';
import { createApproxTokenizer } from '@core/text/tokenizer';

const minos: Entity = { id: 'ent_minos', kind: 'character', name: 'Minos', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 };
const condition = (value: string, since: number, until?: number): Assertion => ({
  subject: minos.id,
  producer: 'turn',
  basis: 'stated',
  id: `c${since}`,
  at: since,
  since,
  kind: 'state',
  key: 'condition',
  value,
  ...(until === undefined ? {} : { until }),
});
const all = { from: 0, to: 99 };
const act = (i: number, type: Action['type'], text: string): Action => ({ id: `a${i}`, type, versions: [text], active: 0, createdAt: i });
const actions = Array.from({ length: 60 }, (_, i) => act(i, i % 2 ? 'continue' : 'do', `Out ${i}. More.`));
const mem = (text: string, fromAction: number, toAction: number): Memory => ({
  id: text,
  text,
  fromAction,
  toAction,
  actionIds: [],
  useCount: 0,
  createdAt: 0,
});

describe('gapsOf', () => {
  it('is a run of presence without them, after they were first there', () => {
    const presence = [
      { at: 2, present: ['other'] },
      { at: 5, present: [minos.id] },
      { at: 31, present: ['other'] },
      { at: 34, present: [minos.id, 'other'] },
    ];
    expect(gapsOf(minos.id, presence, [], all)).toEqual([{ from: 31, to: 34, kind: 'away' }]);
  });

  it('is an unaware condition, ended or current, and not a waking one', () => {
    expect(gapsOf(minos.id, [], [condition('unconscious', 40, 56), condition('awake', 56)], all)).toEqual([{ from: 40, to: 56, kind: 'asleep' }]);
    expect(gapsOf(minos.id, [], [condition('Out cold', 40)], { from: 0, to: 60 })).toEqual([{ from: 40, to: 61, kind: 'asleep' }]);
    expect(gapsOf(minos.id, [], [condition('wounded', 40)], all)).toEqual([]);
  });

  it('merges gaps that touch, and cuts them to the window', () => {
    const presence = [
      { at: 0, present: [minos.id] },
      { at: 30, present: [] },
      { at: 40, present: [minos.id] },
    ];
    expect(gapsOf(minos.id, presence, [condition('asleep', 40, 50)], all)).toEqual([{ from: 30, to: 50, kind: 'away' }]);
    expect(gapsOf(minos.id, presence, [condition('asleep', 40, 50)], { from: 45, to: 99 })).toEqual([{ from: 45, to: 50, kind: 'away' }]);
    expect(gapsOf(minos.id, presence, [], { from: 40, to: 99 })).toEqual([]);
  });
});

describe('witnessClause', () => {
  const gap = { from: 47, to: 56, kind: 'asleep' } as const;

  it('quotes the memory overlapping the gap most, else the gap’s first AI output', () => {
    const memories = [mem('Long ago. Other.', 0, 10), mem('Weever spoke of the amulet. Then left.', 45, 55), mem('Edge.', 55, 70)];
    expect(witnessClause(gap, memories, actions)).toBe('slept through actions 47–55: Weever spoke of the amulet');
    expect(witnessClause({ from: 31, to: 32, kind: 'away' }, [], actions)).toBe('was away for action 31: Out 31');
    expect(witnessClause({ from: 30, to: 31, kind: 'away' }, [], actions)).toBe('was away for action 30');
  });

  it('keeps to the token cap', () => {
    const clause = witnessClause(gap, [mem(Array.from({ length: 80 }, (_, i) => `word${i}`).join(' '), 47, 56)], actions);
    expect(createApproxTokenizer().count(clause)).toBeLessThanOrEqual(WITNESS_TOKENS);
  });
});

describe('presentLine with witnessed-by', () => {
  it('adds each clause after the stance, and none without one', () => {
    expect(presentLine(minos, [], [minos], false, ['slept through actions 47–55: the talk of the amulet.']).text).toBe(
      'Minos — slept through actions 47–55: the talk of the amulet.',
    );
    expect(presentLine(minos, [], [minos], false).text).toBe('Minos.');
  });
});
