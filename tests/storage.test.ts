import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DexieStorage } from '@adapters/storage';
import { ActionLog } from '@core/log';
import { StorageError, TRACE_CAP_PER_ADVENTURE } from '@core/ports';
import { markPending } from '@adapters/storage';
import { makeAdventure } from './fixtures/adventure';
import { fakeLocalStorage } from './fixtures/localStorage';
import { makeTrace } from './fixtures/trace';

let n = 0;
const freshName = () => `test-${++n}`;

async function reopen(name: string): Promise<DexieStorage> {
  const s = new DexieStorage(name);
  await s.init();
  return s;
}

describe('DexieStorage', () => {
  it('round-trips an adventure with embeddings', async () => {
    const name = freshName();
    const adv = makeAdventure({ actions: 30, cards: 5, memories: 4, embeddingDim: 8 });
    await (await reopen(name)).putAdventure(adv);
    const back = await (await reopen(name)).getAdventure(adv.id);
    // Float32 storage rounds embeddings; everything else is exact.
    const f32 = (xs?: number[]) => xs?.map((x) => Math.fround(x));
    expect(back).toEqual({ ...adv, memories: adv.memories.map((m) => ({ ...m, embedding: f32(m.embedding) })) });
  });

  it('saves incremental changes: append, retry, erase, card and memory edits', async () => {
    const name = freshName();
    const s = await reopen(name);
    await s.putAdventure(makeAdventure({ actions: 10, cards: 3, memories: 2, embeddingDim: 4 }));
    const [summary] = await s.listAdventures();
    const adv = await s.getAdventure(summary?.id ?? '');
    if (!adv) throw new Error('missing');
    const log = new ActionLog(adv.actions);
    log.append('do', '> You run.');
    log.append('continue', 'The wind follows.');
    await s.putAdventure({ ...adv, actions: log.actions });
    log.addVersion(log.last?.id ?? '', 'The wind stops.');
    const id5 = log.actions[5]?.id ?? '';
    log.eraseTo(id5);
    const edited = {
      ...adv,
      actions: log.actions,
      storyCards: [...adv.storyCards.slice(1), { id: 'new', type: 'Location', name: 'Gate', entry: 'A gate.', triggers: ['gate'] }],
      memories: adv.memories.map((m, i) => (i === 0 ? { ...m, useCount: 9 } : m)),
    };
    await s.putAdventure(edited);
    expect(await (await reopen(name)).getAdventure(adv.id)).toEqual(edited);
    expect((await s.listAdventures())[0]?.actionCount).toBe(5);
  });

  it('migrates whole-adventure records from the old IndexedDB store', async () => {
    const name = freshName();
    const adv = makeAdventure({ actions: 6, cards: 2 });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.addEventListener('upgradeneeded', () => {
        open.result.createObjectStore('adventures', { keyPath: 'id' });
        open.result.createObjectStore('scenarios', { keyPath: 'id' });
        open.result.createObjectStore('settings');
      });
      open.addEventListener('success', () => {
        const tx = open.result.transaction('adventures', 'readwrite');
        tx.objectStore('adventures').put(adv);
        tx.addEventListener('complete', () => (open.result.close(), resolve()));
      });
      open.addEventListener('error', () => reject(open.error));
    });
    expect(await (await reopen(name)).getAdventure(adv.id)).toEqual(adv);
  });

  it('reports a damaged record instead of returning it', async () => {
    const name = freshName();
    const adv = makeAdventure({ actions: 2 });
    await (await reopen(name)).putAdventure({ ...adv, storyCards: [{ id: 'c', type: 'x', name: 'n', entry: 'e', triggers: 42 as unknown as string[] }] });
    await expect((await reopen(name)).getAdventure(adv.id)).rejects.toThrow(StorageError);
    await expect((await reopen(name)).getAdventure(adv.id)).rejects.toThrow(/storyCards\.0\.triggers/);
  });

  it('replays a save the hiding tab could not finish', async () => {
    const items = fakeLocalStorage();
    const name = freshName();
    const adv = makeAdventure({ actions: 6, memories: 2, embeddingDim: 4 });
    const s = await reopen(name);
    await s.putAdventure(adv);
    const stored = await s.getAdventure(adv.id);
    if (!stored) throw new Error('missing');
    // What persistNow writes when the tab hides inside the debounce.
    markPending({ ...stored, plot: { ...stored.plot, storySummary: 'Edited in the debounce.' }, updatedAt: stored.updatedAt + 1 });

    const back = await (await reopen(name)).getAdventure(adv.id);
    expect(back?.plot.storySummary).toBe('Edited in the debounce.');
    // Embeddings stay out of the marker and come back from the stored bank.
    expect(back?.memories.map((m) => m.embedding)).toEqual(stored.memories.map((m) => m.embedding));
    expect(items.size).toBe(0);
    expect((await (await reopen(name)).getAdventure(adv.id))?.plot.storySummary).toBe('Edited in the debounce.');
  });

  it('ignores a pending save that is not newer or belongs elsewhere', async () => {
    const items = fakeLocalStorage();
    const name = freshName();
    const adv = makeAdventure({ actions: 4 });
    const s = await reopen(name);
    await s.putAdventure(adv);
    const stored = await s.getAdventure(adv.id);
    if (!stored) throw new Error('missing');
    markPending({ ...stored, plot: { ...stored.plot, storySummary: 'Stale.' } });
    expect((await (await reopen(name)).getAdventure(adv.id))?.plot.storySummary).toBe(stored.plot.storySummary);
    items.set('storyloom.pending', 'not json');
    expect((await (await reopen(name)).getAdventure(adv.id))?.plot.storySummary).toBe(stored.plot.storySummary);
    expect(items.size).toBe(0);
  });

  it('fills settings fields added after they were saved', async () => {
    const name = freshName();
    const s = await reopen(name);
    await s.putSettings({ providers: [], defaultProviderId: 'local' } as never);
    const got = await (await reopen(name)).getSettings();
    expect(got?.theme).toBe('dark');
    expect(got?.defaults.context.evictionChunk).toBe(8);
  });
});

describe('DexieStorage traces', () => {
  it('round-trips a trace and reports a damaged one', async () => {
    const name = freshName();
    const trace = makeTrace({ turnId: 'turn-1', actionId: 'a7', stats: { promptTokens: 100, generatedTokens: 20 } });
    await (await reopen(name)).putTrace(trace);
    expect(await (await reopen(name)).getTrace('turn-1')).toEqual(trace);
    expect(await (await reopen(name)).getTrace('nope')).toBeUndefined();

    await (await reopen(name)).putTrace({ ...trace, turnId: 'bad', sections: 'wrong' as never });
    await expect((await reopen(name)).getTrace('bad')).rejects.toThrow(StorageError);
  });

  it('prunes the oldest traces beyond the per-adventure cap', async () => {
    const s = await reopen(freshName());
    const extra = 5;
    for (let i = 0; i < TRACE_CAP_PER_ADVENTURE + extra; i++) await s.putTrace(makeTrace({ turnId: `t${i}`, createdAt: i }));
    const kept = await s.listTraces('adv1');
    expect(kept.length).toBe(TRACE_CAP_PER_ADVENTURE);
    expect(kept[0]?.turnId).toBe(`t${TRACE_CAP_PER_ADVENTURE + extra - 1}`); // newest first
    expect(await s.getTrace('t0')).toBeUndefined();
    expect(await s.getTrace(`t${extra}`)).toBeDefined();
  });

  it('deletes traces with their adventure only, and keeps orphans of erased actions', async () => {
    const name = freshName();
    const s = await reopen(name);
    const adv = makeAdventure({ actions: 4 });
    await s.putAdventure(adv);
    await s.putTrace(makeTrace({ turnId: 'mine', adventureId: adv.id, actionId: 'a2' }));
    await s.putTrace(makeTrace({ turnId: 'other', adventureId: 'elsewhere' }));

    // Erasing the action the trace points at must not remove the trace.
    await s.putAdventure({ ...adv, actions: adv.actions.slice(0, 2) });
    expect(await s.getTrace('mine')).toBeDefined();

    await s.deleteAdventure(adv.id);
    expect(await s.getTrace('mine')).toBeUndefined();
    expect(await s.listTraces(adv.id)).toEqual([]);
    expect(await s.getTrace('other')).toBeDefined();
  });
});
