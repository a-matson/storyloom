import { describe, expect, it } from 'vitest';
import { presentLine } from '@core/context/cast';
import { gapsOf, witnessClause } from '@core/context/witness';
import { withPresence } from '@core/memory';
import type { Assertion, Entity, PlotComponents } from '@core/model';

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

describe('gapsOf', () => {
  it('is a run in another room of the same place (M21-1), closed when they rejoin', () => {
    const present = [minos.id, 'other'];
    const plot: PlotComponents = {};
    plot.presence = withPresence(plot, { present }, 2);
    plot.presence = withPresence(plot, { present, zones: { [minos.id]: 'the basement' } }, 5);
    plot.presence = withPresence(plot, { present }, 9);
    expect(gapsOf(minos.id, plot.presence ?? [], [], all)).toEqual([{ from: 5, to: 9, kind: 'away' }]);
  });

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
  it('names neither content nor range', () => {
    expect(witnessClause({ from: 44, to: 50, kind: 'away' })).toBe('was away for part of the scene and does not know what was said then');
    expect(witnessClause({ from: 31, to: 32, kind: 'away' })).toBe(witnessClause({ from: 44, to: 50, kind: 'away' }));
  });

  it('reads `slept through` for an asleep gap', () => {
    expect(witnessClause({ from: 47, to: 56, kind: 'asleep' })).toBe('slept through part of the scene and does not know what happened then');
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
