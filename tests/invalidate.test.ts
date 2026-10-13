import { describe, expect, it } from 'vitest';
import { mergeAssertions, type Rest } from '@core/memory/assertionWrites';
import { mergeEntity } from '@core/memory/entities';
import { dropUnsupported, followLog, markSummaryDirty, sourceIn } from '@core/memory/invalidate';
import { byPlayer } from '@core/memory/looks';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Adventure } from '@core/model/types';

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });
const edited = (a: Action, text: string): Action => ({ ...a, versions: [...a.versions, text], active: a.versions.length });
const editAt = (adv: Adventure, i: number, text: string) => adv.actions.map((a, j) => (j === i ? edited(a, text) : a));

type Said = { description?: string; facts?: string[]; state?: Record<string, string> };
/** Folds what the story said about Tamsin at `at`, resting on action `rest.at`. */
function say(adv: Adventure, said: Said, at: number, rest: Rest) {
  const [e] = adv.entities;
  if (!e) throw new Error('no entity');
  adv.assertions = mergeAssertions(e, adv.assertions, { description: '', facts: [], ...said }, at, { producer: 'turn', source: () => rest });
}

/** Three actions; Tamsin's trait and looks are read from the middle one. */
function story(): Adventure {
  const adv = createBlankAdventure('T', '');
  adv.actions = [act('a0', 'You reach the river.'), act('a1', 'Tamsin, grey-haired, rows the ferry.'), act('a2', 'The far bank is dark.')];
  adv.entities = [mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 2)];
  say(adv, { facts: ['She rows the ferry.'], state: { hair: 'grey' } }, 2, { at: 1 });
  return adv;
}

describe('derived values follow edits', () => {
  it('attributes a value to the newest action holding its longest word', () => {
    const adv = story();
    expect(sourceIn(adv.actions, { fromAction: 0, toAction: 3 })('She rows the ferry.')?.sourceId).toBe('a1');
  });

  it('keeps values whose action is unchanged, drops them when it changes or is erased', () => {
    const adv = story();
    expect(dropUnsupported(adv, adv.actions)).toEqual({ facts: 0, scene: false });
    expect(dropUnsupported(adv, editAt(adv, 1, 'A boy rows the ferry.'), new Set([1]))).toEqual({ facts: 2, scene: false });
    expect(adv.assertions).toEqual([]);
    const erased = story();
    expect(dropUnsupported(erased, erased.actions.slice(0, 1)).facts).toBe(2);
  });

  it('gives a key back to the value a dropped one ended', () => {
    const adv = story();
    say(adv, { state: { location: 'the river' } }, 0, { at: 0 });
    say(adv, { state: { location: 'the far bank' } }, 2, { at: 2 });
    dropUnsupported(adv, editAt(adv, 2, 'The fog thickens.'), new Set([2]));
    expect(adv.assertions.flatMap((a) => (a.kind === 'state' ? [[a.value, a.until]] : []))).toEqual([['the river', undefined]]);
  });

  it('checks the span instead of the change when a value has one', () => {
    const adv = story();
    adv.assertions = adv.assertions.map((a) => ({ ...a, span: 'rows  the FERRY' }));
    expect(dropUnsupported(adv, editAt(adv, 1, 'Tamsin, bald now, rows the ferry.'), new Set([1])).facts).toBe(0);
    expect(dropUnsupported(adv, editAt(adv, 1, 'Tamsin sleeps.')).facts).toBe(2);
  });

  it("keeps the player's, pinned and unsourced legacy lines", () => {
    const adv = story();
    const [trait] = adv.assertions;
    if (!trait) throw new Error('no trait');
    adv.assertions = [
      { ...trait, id: 'pinned', pinned: true },
      { ...trait, id: 'yours', basis: 'player' },
      { ...trait, id: 'legacy', basis: 'legacy' },
      byPlayer(trait.subject, 1, { kind: 'trait', text: 'She lies.' }),
    ];
    dropUnsupported(adv, []);
    expect(adv.assertions).toHaveLength(4);
  });

  it('drops an identity the edited action no longer holds and clears the description it set', () => {
    const adv = story();
    adv.entities = [{ ...adv.entities[0]!, description: 'A ferrywoman.' }];
    say(adv, { description: 'A ferrywoman.' }, 2, { at: 1, span: 'rows the ferry' });
    dropUnsupported(adv, editAt(adv, 1, 'A boy waits.'), new Set([1]));
    expect(adv.assertions).toEqual([]);
    expect(adv.entities[0]?.description).toBe('');
  });

  it("clears the scene's source and rewinds the batch extraction to the edited action", () => {
    const adv = story();
    adv.plot.scene = { location: 'the river', present: ['Tamsin'], sourceId: 'a2', sourceHash: 'old' };
    adv.scriptState = { ...adv.scriptState, __entitiesAt: 3 };
    expect(dropUnsupported(adv, editAt(adv, 1, 'A boy rows.'), new Set([1])).scene).toBe(true);
    expect(adv.plot.scene).toEqual({ location: 'the river', present: ['Tamsin'] });
    expect(adv.scriptState.__entitiesAt).toBe(1);
  });

  it('marks the summary dirty only for actions it already read', () => {
    const adv = story();
    adv.scriptState = { ...adv.scriptState, __summaryAt: 2 };
    markSummaryDirty(adv, [2]);
    expect(adv.scriptState.__summaryDirty).toBeUndefined();
    markSummaryDirty(adv, [1]);
    expect(adv.scriptState.__summaryDirty).toBe(true);
  });

  it('follows a log change: stale memory, dropped line, dirty summary; nothing for an append', () => {
    const adv = story();
    adv.memories = [{ id: 'm', text: 't', fromAction: 0, toAction: 3, actionIds: ['a0', 'a1', 'a2'], useCount: 0, createdAt: 0 }];
    adv.scriptState = { ...adv.scriptState, __summaryAt: 3 };
    const appended = [...adv.actions, act('a3', 'More.')];
    followLog(adv, adv.actions, appended);
    expect(adv.memories[0]?.stale).toBeUndefined();
    expect(adv.assertions).toHaveLength(2);
    followLog(
      adv,
      appended,
      appended.map((a) => (a.id === 'a1' ? edited(a, 'A boy rows.') : a)),
    );
    expect(adv.memories[0]?.stale).toBe(true);
    expect(adv.assertions).toHaveLength(0);
    expect(adv.scriptState.__summaryDirty).toBe(true);
  });
});
