import { describe, expect, it } from 'vitest';
import { lastActive, spotlight } from '@core/context/spotlight';
import { indexAssertions } from '@core/memory/assertionIndex';
import type { Action, Assertion, Entity } from '@core/model/types';

const person = (name: string, kind: Entity['kind'] = 'character'): Entity => ({
  id: `e-${name}`,
  kind,
  name,
  aliases: name === 'Pike' ? ['the ferryman'] : [],
  description: '',
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});
const said = (...names: string[]): Action => ({
  id: 'a',
  type: 'continue',
  versions: ['…'],
  active: 0,
  createdAt: 0,
  speakers: names.map((name, paragraph) => ({ paragraph, name })),
});
const state = (subject: string, since: number, seen?: boolean): Assertion => ({
  id: `s-${subject}-${since}`,
  subject,
  producer: 'turn',
  at: since,
  basis: 'stated',
  since,
  kind: 'state',
  key: 'mood',
  value: 'wary',
  ...(seen !== undefined && { seen }),
});

const [lena, pike, rowan, mill] = [person('Lena'), person('Pike'), person('Rowan'), person('Mill', 'place')];
// Pike speaks at 2 (by alias), Lena at 0 but changes state at 1, Rowan never acts.
const actions = [said('Lena'), said(), said('The Ferryman')];
const ix = indexAssertions([state(lena.id, 1), state(rowan.id, 3, false)]);

describe('lastActive', () => {
  it('takes the later of a speaker label and an accepted state change', () => {
    expect(lastActive(pike, actions, ix)).toBe(2);
    expect(lastActive(lena, actions, ix)).toBe(1);
    expect(lastActive(lena, [said('Lena'), said(), said(), said('Lena')], ix)).toBe(3);
  });

  it('ignores a state change the player has not seen; never active is -1', () => {
    expect(lastActive(rowan, actions, ix)).toBe(-1);
  });
});

describe('spotlight', () => {
  const here = [pike, mill, lena, rowan];

  it('keeps the order when fixed', () => {
    expect(spotlight(here, actions, ix, 'fixed')).toEqual(here);
  });

  it('sorts the characters by last activity in their own slots, the place unmoved', () => {
    expect(spotlight(here, actions, ix, 'quietFirst').map((e) => e.name)).toEqual(['Rowan', 'Mill', 'Lena', 'Pike']);
    expect(spotlight(here, actions, ix, 'quietLast').map((e) => e.name)).toEqual(['Pike', 'Mill', 'Lena', 'Rowan']);
  });

  it('keeps the input order on ties', () => {
    const tamsin = person('Tamsin');
    expect(spotlight([tamsin, rowan], [], ix, 'quietFirst')).toEqual([tamsin, rowan]);
    expect(spotlight([rowan, tamsin], [], ix, 'quietLast')).toEqual([rowan, tamsin]);
  });
});
