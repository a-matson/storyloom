import { describe, expect, it } from 'vitest';
import { advance, formatTime, parseTravel, parseTime, parseWait, travel } from '@core/memory/clock';
import { mergeEntity } from '@core/memory/entities';
import type { Entity, PlotComponents } from '@core/model/types';

const evening = { day: 2, part: 'evening' } as const;
const hours = (n: number) => ({ n, unit: 'hours' }) as const;

describe('advance', () => {
  it('moves one part per four hours, rounded; minutes never move it', () => {
    expect(advance(evening, hours(3))).toEqual({ day: 2, part: 'night' });
    expect(advance(evening, hours(2))).toEqual({ day: 2, part: 'night' });
    expect(advance(evening, hours(1))).toEqual(evening);
    expect(advance(evening, { n: 90, unit: 'minutes' })).toEqual(evening);
  });

  it('wraps past night to the next dawn; days keep the part', () => {
    expect(advance({ day: 2, part: 'night' }, hours(4))).toEqual({ day: 3, part: 'dawn' });
    expect(advance(evening, { n: 2, unit: 'days' })).toEqual({ day: 4, part: 'evening' });
  });

  it('waits until the next such part', () => {
    expect(advance(evening, { until: 'night' })).toEqual({ day: 2, part: 'night' });
    expect(advance(evening, { until: 'morning' })).toEqual({ day: 3, part: 'morning' });
    expect(advance(evening, { until: 'evening' })).toEqual({ day: 3, part: 'evening' });
  });

  it('starts an unknown time from day 1, morning', () => {
    expect(advance(undefined, hours(4))).toEqual({ day: 1, part: 'midday' });
    expect(formatTime(evening)).toBe('Day 2, evening');
  });
});

describe('parsing', () => {
  it('reads waits and junk', () => {
    expect(parseWait('3 hours')).toEqual(hours(3));
    expect(parseWait('an hour')).toEqual(hours(1));
    expect(parseWait('2 days')).toEqual({ n: 2, unit: 'days' });
    expect(parseWait('until night')).toEqual({ until: 'night' });
    expect(parseWait('a while')).toBeUndefined();
    expect(parseWait('until lunch')).toBeUndefined();
  });

  it('reads times, keeping the day when none is given', () => {
    expect(parseTime('evening, day 2')).toEqual(evening);
    expect(parseTime('Day 2 evening')).toEqual(evening);
    expect(parseTime('dawn', evening)).toEqual({ day: 2, part: 'dawn' });
    expect(parseTime('dawn')).toEqual({ day: 1, part: 'dawn' });
    expect(parseTime('teatime')).toBeUndefined();
    expect(parseTime('day 2')).toBeUndefined();
  });

  it('reads a place and "alone"', () => {
    expect(parseTravel('the docks alone')).toEqual({ place: 'the docks', alone: true });
    expect(parseTravel('The Docks')).toEqual({ place: 'The Docks', alone: false });
    expect(parseTravel(' alone ')).toBeUndefined();
  });
});

describe('travel', () => {
  const docks: Entity = mergeEntity(undefined, { name: 'the docks', kind: 'place', description: '' }, 0);
  const plot: PlotComponents = { scene: { location: 'the mill', present: ['ent_lena'], time: evening }, presence: [{ at: 1, present: ['ent_lena'] }] };

  it('moves to a known place by id, logs it and keeps company and time', () => {
    const p = travel(plot, [docks], 'The Docks', 5, false);
    expect(p.scene).toEqual({ location: docks.id, present: ['ent_lena'], time: evening, since: 5 });
    expect(p.sceneLog).toEqual([{ at: 5, location: 'the docks' }]);
    expect(p.presence).toBe(plot.presence);
  });

  it('moves to an unknown place as written; alone empties who is present', () => {
    const p = travel(plot, [], 'the old road', 5, true);
    expect(p.scene).toEqual({ location: 'the old road', present: [], time: evening, since: 5 });
    expect(p.presence?.at(-1)).toEqual({ at: 5, present: [] });
  });

  it('to a room of this place sets zone, not a move; alone leaves the company in your old room', () => {
    const mill = mergeEntity(undefined, { name: 'the mill', kind: 'place', description: '' }, 0);
    const loft = { ...mergeEntity(undefined, { name: 'the loft', kind: 'place', description: '' }, 0), partOf: mill.id };
    const at = { ...plot, scene: { location: mill.id, present: ['ent_lena'], time: evening, since: 2 } };
    const p = travel(at, [mill, loft, docks], 'loft', 5, false);
    expect(p.scene).toEqual({ ...at.scene, zone: 'the loft' });
    expect(p.sceneLog).toBeUndefined();
    expect(p.presence).toBe(plot.presence);
    const alone = travel(at, [mill, loft], 'the loft', 5, true);
    expect(alone.scene).toEqual({ ...at.scene, zones: { ent_lena: 'the mill' }, zone: 'the loft' });
    expect(alone.presence?.at(-1)).toEqual({ at: 5, present: [] });
    expect(travel(alone, [mill, loft, docks], 'the docks', 6, false).scene).toEqual({ location: docks.id, present: ['ent_lena'], time: evening, since: 6 });
  });
});
