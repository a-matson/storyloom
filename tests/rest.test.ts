import { describe, expect, it } from 'vitest';
import { elapsedParts, skipEnds } from '@core/memory/clock';
import { endTransient } from '@core/memory/rest';
import type { Assertion } from '@core/model';

const base = { producer: 'turn', at: 1, basis: 'stated', since: 1 } as const;
const state = (id: string, key: string, value: string, more: Partial<Assertion> = {}): Assertion =>
  ({ id, subject: 'ent_tamsin', ...base, kind: 'state', key, value, ...more }) as Assertion;
const effect: Assertion = { id: 'e', subject: 'ent_tamsin', ...base, kind: 'effect', condition: 'bleeding palms' };
const store: Assertion[] = [
  state('p', 'posture', 'kneeling'),
  state('m', 'mood', 'fury'),
  state('w', 'wearing', 'grey cloak'),
  state('h', 'holds', 'bell rope'),
  state('c', 'condition', 'bruised'),
  state('pin', 'mood', 'loyal', { subject: 'ent_minos', pinned: true }),
  state('mine', 'posture', 'standing', { subject: 'ent_minos', producer: 'player' }),
  state('old', 'mood', 'calm', { until: 1 }),
  effect,
];
const ended = (as: readonly Assertion[]) => as.filter((a, i) => a !== store[i]).map((a) => [a.id, a.until]);

describe('endTransient', () => {
  it('ends current postures, moods and (with effects) effects; keeps the rest, pinned and the player’s', () => {
    const r = endTransient(store, 5, 'all', { effects: true });
    expect(ended(r.assertions)).toEqual([
      ['p', 5],
      ['m', 5],
      ['e', 5],
    ]);
    expect(r.ended).toBe(3);
  });

  it('without effects, and only for the subjects given', () => {
    expect(ended(endTransient(store, 5, ['ent_tamsin'], { effects: false }).assertions)).toEqual([
      ['p', 5],
      ['m', 5],
    ]);
    expect(endTransient(store, 5, ['ent_lena'], { effects: true }).ended).toBe(0);
  });

  it('never ends a state that began at or after `at`', () => {
    expect(endTransient(store, 1, 'all', { effects: true }).ended).toBe(0);
  });
});

describe('clock skips', () => {
  const morning = { day: 1, part: 'morning' } as const;

  it('counts parts across days', () => {
    expect(elapsedParts(morning, { day: 1, part: 'evening' })).toBe(3);
    expect(elapsedParts({ day: 1, part: 'night' }, { day: 2, part: 'dawn' })).toBe(1);
    expect(elapsedParts({ day: 1, part: 'evening' }, morning)).toBe(-3);
    expect(elapsedParts(undefined, { day: 2, part: 'morning' })).toBe(6);
  });

  it('a wait of two parts or more ends; a set time ends on any later part', () => {
    expect(skipEnds(morning, { day: 1, part: 'afternoon' }, 'wait')).toBe(true); // /wait 8 hours
    expect(skipEnds(morning, { day: 1, part: 'midday' }, 'wait')).toBe(false); // /wait 3 hours
    expect(skipEnds(morning, { day: 1, part: 'evening' }, 'time')).toBe(true);
    expect(skipEnds({ day: 1, part: 'evening' }, morning, 'time')).toBe(false);
    expect(skipEnds({ day: 1, part: 'evening' }, { day: 2, part: 'morning' }, 'time')).toBe(true);
  });
});
