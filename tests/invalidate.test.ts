import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { dropUnsupported, followLog, markSummaryDirty, sourceIn } from '@core/memory/invalidate';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Adventure } from '@core/model/types';

const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });
const edited = (a: Action, text: string): Action => ({ ...a, versions: [...a.versions, text], active: a.versions.length });

/** Three actions; Tamsin's facts and looks are read from the middle one. */
function story(): Adventure {
  const adv = createBlankAdventure('T', '');
  adv.actions = [act('a0', 'You reach the river.'), act('a1', 'Tamsin, grey-haired, rows the ferry.'), act('a2', 'The far bank is dark.')];
  const source = sourceIn(adv.actions, { fromAction: 0, toAction: 3 });
  adv.entities = [
    mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '', facts: ['She rows the ferry.'], appearance: 'grey-haired' }, 2, source),
  ];
  return adv;
}

describe('derived values follow edits', () => {
  it('attributes a value to the newest action holding its longest word', () => {
    const tamsin = story().entities[0];
    expect(tamsin?.facts[0]?.sourceId).toBe('a1');
    expect(tamsin?.appearanceFrom?.sourceId).toBe('a1');
  });

  it('keeps values whose source text is unchanged, drops them when it changes or is erased', () => {
    const adv = story();
    expect(dropUnsupported(adv, adv.actions)).toEqual({ facts: 0, appearances: 0, scene: false });
    const changed = adv.actions.map((a) => (a.id === 'a1' ? edited(a, 'A boy rows the ferry.') : a));
    expect(dropUnsupported(adv, changed)).toEqual({ facts: 1, appearances: 1, scene: false });
    expect(adv.entities[0]?.facts).toEqual([]);
    expect(adv.entities[0]).not.toHaveProperty('appearance');
    const erased = story();
    expect(dropUnsupported(erased, erased.actions.slice(0, 1)).facts).toBe(1);
  });

  it('gives a key back to the state value a dropped one ended', () => {
    const adv = story();
    const source = sourceIn(adv.actions, { fromAction: 0, toAction: 3 });
    const first = mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '', facts: [], state: { location: 'the river' } }, 0, source);
    adv.entities = [mergeEntity(first, { name: 'Tamsin', kind: 'character', description: '', facts: [], state: { location: 'the far bank' } }, 2, source)];
    dropUnsupported(
      adv,
      adv.actions.map((a) => (a.id === 'a2' ? edited(a, 'The fog thickens.') : a)),
    );
    expect(adv.entities[0]?.facts.map((f) => [f.value, f.until])).toEqual([['the river', undefined]]);
  });

  it('checks evidence instead of the hash when a value has it', () => {
    const adv = story();
    const fact = adv.entities[0]?.facts[0];
    if (fact) Object.assign(fact, { evidence: 'rows  the FERRY', sourceHash: undefined });
    const changed = adv.actions.map((a) => (a.id === 'a1' ? edited(a, 'Tamsin, bald now, rows the ferry.') : a));
    expect(dropUnsupported(adv, changed).facts).toBe(0);
  });

  it("keeps the player's, pinned and unsourced facts", () => {
    const adv = story();
    const e = adv.entities[0];
    if (!e) throw new Error('no entity');
    const sourced = e.facts[0];
    if (!sourced) throw new Error('no fact');
    e.facts = [
      { ...sourced, id: 'f1', pinned: true },
      { ...sourced, id: 'f2', basis: 'player' },
      { id: 'f3', text: 'Legacy.', fromAction: 1, source: 'memory' },
      { ...sourced, id: 'f4', source: 'card' },
    ];
    dropUnsupported(adv, []);
    expect(adv.entities[0]?.facts.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it("clears the scene's source and rewinds the batch extraction to the edited action", () => {
    const adv = story();
    adv.plot.scene = { location: 'the river', present: ['Tamsin'], sourceId: 'a2', sourceHash: 'old' };
    adv.scriptState = { ...adv.scriptState, __entitiesAt: 3 };
    const changed = adv.actions.map((a) => (a.id === 'a1' ? edited(a, 'A boy rows.') : a));
    expect(dropUnsupported(adv, changed).scene).toBe(true);
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

  it('follows a log change: stale memory, dropped fact, dirty summary; nothing for an append', () => {
    const adv = story();
    adv.memories = [{ id: 'm', text: 't', fromAction: 0, toAction: 3, actionIds: ['a0', 'a1', 'a2'], useCount: 0, createdAt: 0 }];
    adv.scriptState = { ...adv.scriptState, __summaryAt: 3 };
    const appended = [...adv.actions, act('a3', 'More.')];
    followLog(adv, adv.actions, appended);
    expect(adv.memories[0]?.stale).toBeUndefined();
    expect(adv.entities[0]?.facts).toHaveLength(1);
    followLog(
      adv,
      appended,
      appended.map((a) => (a.id === 'a1' ? edited(a, 'A boy rows.') : a)),
    );
    expect(adv.memories[0]?.stale).toBe(true);
    expect(adv.entities[0]?.facts).toHaveLength(0);
    expect(adv.scriptState.__summaryDirty).toBe(true);
  });
});
