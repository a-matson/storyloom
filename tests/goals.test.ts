import { describe, expect, it } from 'vitest';
import { buildContext as build } from '@core/context';
import { nudgedIn, QUIET_TURNS, quietTurns } from '@core/context/spotlight';
import { indexAssertions } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, type FoldLog } from '@core/memory/fold';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Adventure, Assertion } from '@core/model';
import { GOAL_CHARS } from '@core/schema/extraction';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { cast, input } from './fixtures/structured';
import { derived } from './fixtures/assertions';

const TEXT = 'Tamsin searches the dock for the lost ledger.\n\n"Mind the rope," Tamsin says.';

function story(): Adventure {
  const adv = createBlankAdventure('T', '');
  adv.actions = [{ id: 'a0', type: 'continue', versions: [TEXT], active: 0, createdAt: 0 }];
  adv.entities = [mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 0)];
  return adv;
}

function fold(adv: Adventure, goal: string, at = 0): FoldLog {
  const log: FoldLog = { proposed: 0, rejected: [] };
  foldEntities(
    adv,
    [{ name: 'Tamsin', kind: 'character', description: '', facts: [], goal }],
    `[${at}] ${TEXT}`,
    { fromAction: 0, toAction: adv.actions.length },
    { log },
  );
  return log;
}
const goals = (adv: Adventure) => adv.assertions.filter((a) => a.kind === 'goal');
const live = (adv: Adventure) => goals(adv).filter((a) => a.until === undefined);

describe('the goal fold', () => {
  it('stores a supported goal as a proposal, without the verb the now-line adds', () => {
    const adv = story();
    expect(fold(adv, 'wants to find the lost ledger').rejected).toEqual([]);
    expect(goals(adv)).toMatchObject([{ kind: 'goal', text: 'find the lost ledger', seen: false, at: 0 }]);
  });

  it('keeps the first clause, and a cut goal to its whole words', () => {
    const adv = story();
    fold(adv, 'Search the dock. RefersTo:');
    expect(live(adv).map((a) => a.text)).toEqual(['Search the dock']);
    fold(adv, `search the dock for the lost le${'d'.repeat(GOAL_CHARS - 31)}`);
    expect(live(adv).map((a) => a.text)).toEqual(['search the dock for the lost']);
    fold(adv, 'wants to find the ledger');
    expect(live(adv).map((a) => a.text)).toEqual(['find the ledger']);
  });

  it('rejects a goal no sentence of the range backs', () => {
    const adv = story();
    expect(fold(adv, 'become queen of the marsh').rejected).toMatchObject([{ entity: 'Tamsin', reason: 'no-shared-word' }]);
    expect(goals(adv)).toEqual([]);
  });

  it('a new goal ends the old one; the player one stays', () => {
    const adv = story();
    fold(adv, 'find the lost ledger');
    adv.actions.push({ ...adv.actions[0]!, id: 'a1' });
    fold(adv, 'search the dock', 1);
    expect(goals(adv).map((a) => [a.text, a.until])).toEqual([
      ['find the lost ledger', 1],
      ['search the dock', undefined],
    ]);
    adv.assertions = adv.assertions.map((a) => (a.kind === 'goal' && a.until === undefined ? { ...a, basis: 'player' } : a));
    fold(adv, 'mind the rope', 1);
    expect(live(adv).map((a) => a.text)).toEqual(['search the dock']);
  });
});

describe('quietTurns', () => {
  const adv = story();
  const tamsin = adv.entities[0]!;
  const line = (n: number, speakers?: Action['speakers']): Action => ({
    id: `q${n}`,
    type: 'continue',
    versions: ['.'],
    active: 0,
    createdAt: n,
    ...(speakers && { speakers }),
  });
  const state = (since: number, seen?: false): Assertion => ({
    id: `s${since}`,
    subject: tamsin.id,
    producer: 'turn',
    at: since,
    basis: 'stated',
    since,
    kind: 'state',
    key: 'mood',
    value: 'wary',
    ...(seen === false && { seen }),
  });
  const actions = [line(0, [{ paragraph: 0, name: 'Tamsin' }]), line(1), line(2), line(3), line(4)];

  it('counts from the last speaker label or accepted state change', () => {
    expect(quietTurns(tamsin, actions, indexAssertions([]))).toBe(4);
    expect(quietTurns(tamsin, actions, indexAssertions([state(2)]))).toBe(2);
  });

  it('ignores an unseen state change', () => {
    expect(quietTurns(tamsin, actions, indexAssertions([state(3, false)]))).toBe(4);
  });
});

describe('wants: on the now-line', () => {
  const goal = (over: { seen?: boolean } = {}): Assertion => ({
    id: 'g1',
    subject: 'e-Lena',
    producer: 'batch',
    at: 0,
    basis: 'stated',
    since: 0,
    kind: 'goal',
    text: 'sell the mill',
    ...over,
  });
  const base = input(4000).actions;
  // Lena speaks `quiet` actions before the last one.
  const quietFor = (quiet: number) => base.map((a, i) => (i === base.length - 1 - quiet ? { ...a, speakers: [{ paragraph: 0, name: 'Lena' }] } : a));
  const lena = (g: Assertion, actions: Action[], nudged?: string[]) => {
    const i = derived({ ...input(4000), actions, ...(nudged && { nudged }) });
    return cast(build({ ...i, assertions: [...i.assertions, g] }))
      ?.split('\n')
      .find((l) => l.startsWith('Lena'));
  };

  it('is sent for a confirmed goal after QUIET_TURNS quiet actions, after speaks: and before pins', () => {
    const l = lena(goal(), quietFor(QUIET_TURNS));
    expect(l).toContain('wants: sell the mill');
    expect(l?.indexOf('wants:')).toBeLessThan(l?.indexOf('She hums') ?? -1);
  });

  it('is not sent when they acted recently, nor while it is a proposal', () => {
    expect(lena(goal(), quietFor(QUIET_TURNS - 1))).not.toContain('wants:');
    expect(lena(goal({ seen: false }), quietFor(QUIET_TURNS))).not.toContain('wants:');
  });

  it('a nudge sends it however recently they acted', () => {
    expect(lena(goal(), quietFor(0), ['e-Lena'])).toContain('wants: sell the mill');
  });

  it('costs at most 10 tokens for a goal the cap cut', () => {
    const full = 'search the dock for the lost'; // what the fold keeps of a cut 'search the dock for the lost led'
    expect(createApproxTokenizer().count(`; wants: ${full}`)).toBeLessThanOrEqual(10);
  });
});

describe('nudgedIn', () => {
  it('keeps a nudge for the next turn only', () => {
    const at = 10;
    expect(nudgedIn([{ id: 'x', at }], at)).toEqual(['x']); // the Now card, before the turn
    expect(nudgedIn([{ id: 'x', at }], at + 1)).toEqual(['x']); // the player's action appended
    expect(nudgedIn([{ id: 'x', at }], at + 3)).toEqual([]); // the turn after
  });
});
