import { describe, expect, it } from 'vitest';
import { knowledgeOf, knownByOf, knowsClause } from '@core/memory/knowledge';
import { newSecret, type Secret } from '@core/memory/secrets';
import type { Assertion, Entity, PlotComponents } from '@core/model';
import { buildContext as build_ } from '@core/context';
import { derived } from './fixtures/assertions';
import { act, actions, cast, input, lena } from './fixtures/structured';

const char = (id: string): Entity => ({ id, kind: 'character', name: id, aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 });
const [minos, weever] = [char('minos'), char('weever')];
const base = { producer: 'turn', basis: 'stated' } as const;
const event = (text: string, at: number, who = ['minos']): Assertion & { kind: 'event' } => ({
  ...base,
  subject: who[0] ?? '',
  id: `ev${at}`,
  at,
  since: at,
  kind: 'event',
  text,
  who,
});
const asleep = (subject: string, since: number, until?: number): Assertion => ({
  ...base,
  subject,
  id: `z${since}`,
  at: since,
  since,
  kind: 'state',
  key: 'condition',
  value: 'asleep',
  ...(until === undefined ? {} : { until }),
});
const ledger = event('Minos hides the silver ledger beneath the millstone.', 10);
const presence = [
  { at: 0, present: ['minos'] },
  { at: 20, present: ['minos', 'weever'] },
];
const store = (assertions: Assertion[], plot: PlotComponents = { presence }) => ({ plot, assertions });

describe('knownByOf', () => {
  it('is you and whoever was present: Minos there, Weever away', () => {
    expect(knownByOf(ledger, store([ledger]))).toEqual(['you', 'minos']);
  });

  it('leaves out someone in another room of the current scene, not before it moved there', () => {
    const plot = { presence: [{ at: 0, present: ['minos', 'weever'] }], scene: { present: ['minos', 'weever'], zones: { weever: 'the loft' }, since: 5 } };
    expect(knownByOf(ledger, store([ledger], plot))).toEqual(['you', 'minos']);
    expect(knownByOf(event('Minos hides the ledger.', 2), store([], plot))).toEqual(['you', 'minos', 'weever']);
  });

  it('is a secret marked on the action that retells it: told only to Weever', () => {
    const s = { ...newSecret(10, 'Minos hides the silver ledger.', ['weever']), id: 's' };
    expect(knownByOf(ledger, store([ledger, s]))).toEqual(['you', 'weever']);
  });

  it('leaves out someone asleep then', () => {
    const plot = { presence: [{ at: 0, present: ['minos', 'weever'] }] };
    expect(knownByOf(ledger, store([ledger, asleep('weever', 8, 12)], plot))).toEqual(['you', 'minos']);
    expect(knownByOf(ledger, store([ledger, asleep('weever', 2, 9)], plot))).toEqual(['you', 'minos', 'weever']);
  });
});

describe('knowledgeOf', () => {
  it('lists what each knows, by action', () => {
    const later = event('Weever and Minos burn the old map.', 25, ['weever', 'minos']);
    const s = store([later, ledger]);
    expect(knowledgeOf('minos', s).map((e) => e.id)).toEqual(['ev10', 'ev25']);
    expect(knowledgeOf('weever', s).map((e) => e.id)).toEqual(['ev25']);
  });
});

describe('knowsClause', () => {
  // "silver" and "beneath" are common words; the name counts.
  const said = 'You ask Minos about the silver ledger beneath the millstone.';
  it('fires for the one who knows, when the input echoes it and someone present does not', () => {
    expect(knowsClause('minos', [minos, weever], store([ledger]), said, [])).toBe('knows: Minos hides the silver ledger beneath the millstone.');
    expect(knowsClause('weever', [minos, weever], store([ledger]), said, [])).toBeUndefined();
    expect(knowsClause('minos', [minos], store([ledger]), said, [])).toBeUndefined();
    expect(knowsClause('minos', [minos, weever], store([ledger]), 'You wait.', [])).toBeUndefined();
  });

  it('never quotes an event a cut secret covers', () => {
    const s = { ...newSecret(10, 'Minos hides the silver ledger.', ['minos']), id: 's' } as Secret;
    expect(knowsClause('minos', [minos, weever], store([ledger, s]), said, [s])).toBeUndefined();
  });
});

describe('the knows clause on a cast line', () => {
  const story = [...actions.slice(0, -1), act('do', '> You ask Lena about the silver ledger beneath the millstone.')];
  const hid = event('Lena hides the silver ledger beneath the millstone.', 10, ['e-Lena']);
  const build = (assertions: Assertion[]) => {
    const i = input(4000);
    const plot = {
      ...i.plot,
      scene: { ...i.plot.scene, present: ['Lena', 'Orrin'] },
      presence: [
        { at: 0, present: ['e-Lena'] },
        { at: 20, present: ['e-Lena', 'e-Orrin'] },
      ],
    };
    const d = derived({ ...i, actions: story, plot });
    return build_({ ...d, assertions: [...d.assertions, ...assertions] });
  };

  it('goes on the knower only, once', () => {
    const text = cast(build([hid])) ?? '';
    const [l, o] = [text.split('\n').find((x) => x.startsWith('Lena')), text.split('\n').find((x) => x.startsWith('Orrin'))];
    expect(l).toContain('knows: Lena hides the silver ledger beneath the millstone');
    expect(o).not.toContain('knows:');
    expect(text.match(/knows:/g)).toHaveLength(1);
  });

  it('is not sent for a secret being cut', () => {
    const s = { ...newSecret(10, 'Lena hides the silver ledger.', [lena.id]), id: 's' };
    expect(cast(build([hid, s]))).not.toContain('knows:');
  });
});
