import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DexieStorage } from '@adapters/storage';
import { forkAdventure } from '@app/session/fork';
import { forkAt } from '@core/log';
import type { Adventure, Assertion, Memory } from '@core/model/types';
import { makeAdventure } from './fixtures/adventure';

const base = { subject: 'e1', producer: 'player', paragraph: undefined, basis: 'player' } as const;
const state = (id: string, at: number, until?: number): Assertion => ({
  ...base,
  id,
  kind: 'state',
  key: 'mood',
  value: id,
  at,
  since: at,
  ...(until !== undefined && { until }),
});
const event = (id: string, at: number): Assertion => ({ ...base, id, kind: 'event', text: id, who: ['e1'], at, since: at });
const memory = (id: string, fromAction: number, toAction: number): Memory => ({ id, text: id, fromAction, toAction, actionIds: [], useCount: 0, createdAt: 0 });

function story(): Adventure {
  const adv = makeAdventure({ actions: 6, cards: 0 });
  adv.title = 'Salt Road';
  adv.actions = adv.actions.slice(-6);
  adv.entities = [
    { id: 'e1', kind: 'character', name: 'Merav', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 5, canon: true },
    { id: 'p1', kind: 'place', name: 'Gate', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 1, canon: true },
    { id: 'p2', kind: 'place', name: 'Well', aliases: [], description: '', relations: [], firstSeen: 4, lastSeen: 5, canon: true },
  ];
  adv.assertions = [state('calm', 1, 4), state('angry', 4), event('met', 1), event('fought', 3)];
  adv.memories = [memory('early', 0, 3), memory('late', 2, 8)];
  adv.plot = {
    ...adv.plot,
    scene: { location: 'p2', present: ['e1'], zone: 'yard', since: 4 },
    sceneLog: [
      { at: 0, location: 'Gate' },
      { at: 4, location: 'Well' },
    ],
    presence: [
      { at: 0, present: [] },
      { at: 2, present: ['e1'] },
    ],
  };
  adv.scriptState = { ...adv.scriptState, __summaryAt: 6, __entitiesAt: 6, __nudge: [{ id: 'e1', at: 6 }] };
  return adv;
}

describe('forkAt', () => {
  it('cuts the copy to the action and dates everything by it', () => {
    const adv = story();
    const before = structuredClone(adv);
    const fork = forkAt(adv, 3, 'adv_fork', 99);
    expect(adv).toEqual(before);
    expect(fork).toMatchObject({ id: 'adv_fork', title: 'Salt Road — branch', createdAt: 99, updatedAt: 99 });
    expect(fork.actions.map((a) => a.id)).toEqual(['a0', 'a1', 'a2']);
    expect(fork.assertions.map((a) => [a.id, a.until])).toEqual([
      ['calm', undefined],
      ['met', undefined],
    ]);
    expect(fork.memories.map((m) => m.id)).toEqual(['early']);
    expect(fork.plot.sceneLog).toEqual([{ at: 0, location: 'Gate' }]);
    expect(fork.plot.presence).toEqual([
      { at: 0, present: [] },
      { at: 2, present: ['e1'] },
    ]);
    expect(fork.plot.scene).toEqual({ location: 'p1', present: ['e1'], since: 0 });
    expect(fork.entities.find((e) => e.id === 'e1')?.lastSeen).toBe(2);
    expect(fork.scriptState).toMatchObject({ __summaryAt: 3, __entitiesAt: 3, __summaryDirty: true, __nudge: [] });
  });

  it('copies the blobs the branch keeps; deleting it leaves the original whole', async () => {
    const s = new DexieStorage('fork-test');
    await s.init();
    const adv = story();
    adv.actions = adv.actions.map((a, i) => (i === 1 || i === 4 ? { ...a, type: 'see', image: { prompt: 'p', imageId: `img${i}` } } : a));
    await s.putAdventure(adv);
    for (const i of [1, 4]) await s.putImage(adv.id, `img${i}`, new Blob([`b${i}`]));
    const id = await forkAdventure(s, adv, 'a2');
    expect((await s.getAdventure(id))?.actions).toHaveLength(3);
    expect(await (await s.getImage(id, 'img1'))?.text()).toBe('b1');
    expect(await s.getImage(id, 'img4')).toBeUndefined();
    await s.deleteAdventure(id);
    expect(await (await s.getImage(adv.id, 'img1'))?.text()).toBe('b1');
    expect((await s.getAdventure(adv.id))?.actions).toHaveLength(6);
  });

  it('keeps who is present from the last kept entry', () => {
    const fork = forkAt(story(), 2, 'f', 0);
    expect(fork.plot.scene?.present).toEqual([]);
  });
});
