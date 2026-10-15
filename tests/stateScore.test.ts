import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leftWanted, onlySpan, pickSet, placeOf, presentOk, sceneAt, scoreLeft, scoreRows } from '../bench/stateScore';

const labels: unknown = JSON.parse(readFileSync('bench/stateLabels.json', 'utf8'));
const set = pickSet(labels, 'm12-dogfood');

describe('state bench scoring', () => {
  it('maps a free location to the first labelled place with a matching word', () => {
    expect(placeOf('Bedroom in the cottage', set.placeWords)).toBe('bedroom');
    expect(placeOf('the cottage sofa', set.placeWords)).toBe('cottage');
    expect(placeOf('a moonlit clearing', set.placeWords)).toBe('woods');
    expect(placeOf('Harbour', set.placeWords)).toBe('harbour');
  });

  it('compares present lists as sets', () => {
    expect(presentOk(['Minos', 'Weever'], ['Weever', 'Minos'])).toBe(true);
    expect(presentOk(['Minos'], ['Minos', 'Weever'])).toBe(false);
  });

  it('totals three hand rows', () => {
    const rows = [
      { i: 5, cast: ['Minos'], location: 'noodle shop', present: ['Minos'] },
      { i: 27, cast: ['Minos', 'Vorthak', 'Weever'], location: 'the cottage', present: ['Minos', 'Vorthak', 'Weever'] },
      { i: 61, cast: ['Minos', 'Vorthak', 'Weever'], location: 'bed', present: ['Minos'], record: { Minos: { posture: 'sitting', condition: 'asleep' } } },
    ];
    expect(scoreRows(rows, set)).toEqual({ turns: 3, placeOk: 2, presentOk: 3, checkpointsOk: 1, checkpoints: 3 });
  });

  it('filters a replay to a span and seeds it from the labels', () => {
    expect(onlySpan('43-44')).toEqual({ from: 43, to: 44 });
    expect(onlySpan('43')).toEqual({ from: 43, to: 43 });
    expect(onlySpan(undefined)).toBeUndefined();
    const m13 = pickSet(labels, 'm13-dogfood');
    expect(sceneAt(m13, 42)).toEqual({ location: m13.start, present: ['Minos', 'Vorthak', 'Weever'] });
    expect(leftWanted(m13, 42, 44)).toEqual(['Vorthak', 'Weever']);
  });

  it('scores leavers only on turns where someone left', () => {
    const rows = [
      { want: ['Vorthak', 'Weever'], samples: [['Weever', 'Vorthak'], ['Vorthak'], null], ms: [3, 1, 2] },
      { want: [], samples: [[]], ms: [9] },
    ];
    expect(scoreLeft(rows)).toEqual({ leftOk: 1, leftSamples: 3, medianMsA: 3 });
  });

  it('rejects an unknown set and a malformed file', () => {
    expect(() => pickSet(labels, 'nope')).toThrow('no label set');
    expect(() => pickSet({ sets: { x: { start: '' } } }, 'x')).toThrow(/place/);
  });
});
