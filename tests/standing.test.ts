import { describe, expect, it } from 'vitest';
import { standing, stanceWord } from '@core/memory/standing';
import type { Assertion } from '@core/model';
import type { AssertionOf } from '@core/memory';

const base = { producer: 'batch', basis: 'stated' } as const;
let n = 0;
const event = (at: number, text: string, who: string[]): AssertionOf<'event'> => ({
  ...base,
  id: `ev${n++}`,
  subject: who[0] ?? '',
  at,
  since: at,
  kind: 'event',
  text,
  who,
});
// B's stance toward A.
const rel = (over: Partial<AssertionOf<'relationship'>> = {}): AssertionOf<'relationship'> => ({
  ...base,
  id: 'r',
  subject: 'B',
  at: 1,
  since: 1,
  kind: 'relationship',
  to: 'A',
  stance: 'wary',
  ...over,
});

describe('standing', () => {
  it('two rescues of B by A: B trusts A, crossed at the second', () => {
    const s = standing(rel(), [event(2, 'A rescues B from the river', ['A', 'B']), event(5, 'A saved B again', ['A', 'B'])], 'A');
    expect(s).toEqual({ trust: 2, fear: 0, crossedAt: 5 });
    expect(stanceWord(rel(), s)).toBe('trusts');
  });

  it('one rescue keeps the stored stance', () => {
    const s = standing(rel(), [event(2, 'A rescues B', ['A', 'B'])], 'A');
    expect(s).toEqual({ trust: 1, fear: 0 });
    expect(stanceWord(rel(), s)).toBe('wary');
  });

  it('a threat moves the receiver, not the actor', () => {
    const evs = [event(2, 'A threatens B', ['A', 'B']), event(3, 'A attacks B', ['A', 'B'])];
    expect(stanceWord(rel(), standing(rel(), evs, 'A'))).toBe('fears');
    const ab = rel({ subject: 'A', to: 'B' });
    expect(standing(ab, evs, 'B')).toEqual({ trust: 0, fear: 0 });
  });

  it('ignores events before the relationship, clamps at 2, needs both parties', () => {
    expect(standing(rel({ since: 4 }), [event(2, 'A rescues B', ['A', 'B']), event(3, 'A heals B', ['A', 'B'])], 'A').trust).toBe(0);
    const three = [2, 3, 4].map((at) => event(at, 'A rescues B', ['A', 'B']));
    expect(standing(rel(), three, 'A')).toEqual({ trust: 2, fear: 0, crossedAt: 3 });
    expect(standing(rel(), [event(2, 'A rescues a child', ['A'])], 'A').trust).toBe(0);
  });

  it('betrayal after trust drops below the word', () => {
    const evs = [event(2, 'A rescues B', ['A', 'B']), event(3, 'A heals B', ['A', 'B']), event(4, 'A betrays B', ['A', 'B'])];
    const s = standing(rel(), evs, 'A');
    expect(s).toEqual({ trust: 1, fear: 0 });
    expect(stanceWord(rel(), s)).toBe('wary');
    expect(
      stanceWord(
        rel(),
        standing(rel(), [...evs, event(5, 'A lied to B', ['A', 'B']), event(6, 'A abandons B', ['A', 'B']), event(7, 'A stole from B', ['A', 'B'])], 'A'),
      ),
    ).toBe('distrusts');
  });

  it('`you` works as either party', () => {
    const toYou = rel({ to: 'you' });
    expect(stanceWord(toYou, standing(toYou, [event(2, 'You save B', ['you', 'B']), event(3, 'You heal B', ['you', 'B'])], 'you'))).toBe('trusts');
    const yours = rel({ subject: 'you' });
    expect(standing(yours, [event(2, 'A threatens you', ['A', 'you']), event(3, 'A hits you', ['A', 'you'])], 'A').fear).toBe(2);
  });

  it('a stance the player wrote is not moved', () => {
    const mine = rel({ basis: 'player', producer: 'player' });
    const evs: Assertion[] = [event(2, 'A rescues B', ['A', 'B']), event(3, 'A rescues B', ['A', 'B'])];
    expect(stanceWord(mine, standing(mine, evs, 'A'))).toBe('wary');
  });
});
