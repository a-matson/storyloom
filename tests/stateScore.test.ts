import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextPresent, pickSet, placeOf, presentOk, scoreRows } from '../bench/stateScore';

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

  it('keeps whoever did not leave, unless the scene moved', () => {
    expect(nextPresent(['Minos', 'Weever'], { moved: false, present: [], left: ['Weever'] })).toEqual(['Minos']);
    expect(nextPresent(['Minos', 'Weever'], { moved: true, present: ['Minos'], left: [] })).toEqual(['Minos']);
  });

  it('totals three hand rows', () => {
    const rows = [
      { i: 5, cast: ['Minos'], location: 'noodle shop', present: ['Minos'] },
      { i: 27, cast: ['Minos', 'Vorthak', 'Weever'], location: 'the cottage', present: ['Minos', 'Vorthak', 'Weever'] },
      { i: 61, cast: ['Minos', 'Vorthak', 'Weever'], location: 'bed', present: ['Minos'], record: { Minos: { location: 'Bedroom', condition: 'asleep' } } },
    ];
    expect(scoreRows(rows, set)).toEqual({ turns: 3, placeOk: 2, presentOk: 3, checkpointsOk: 1, checkpoints: 4 });
  });

  it('rejects an unknown set and a malformed file', () => {
    expect(() => pickSet(labels, 'nope')).toThrow('no label set');
    expect(() => pickSet({ sets: { x: { start: '' } } }, 'x')).toThrow(/place/);
  });
});
