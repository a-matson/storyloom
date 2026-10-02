import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DexieStorage } from '@adapters/storage';
import { ActionLog } from '@core/log';
import { StorageError } from '@core/ports';
import { makeAdventure } from './fixtures/adventure';

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

  it('fills settings fields added after they were saved', async () => {
    const name = freshName();
    const s = await reopen(name);
    await s.putSettings({ providers: [], defaultProviderId: 'local' } as never);
    const got = await (await reopen(name)).getSettings();
    expect(got?.theme).toBe('dark');
    expect(got?.defaults.context.evictionChunk).toBe(8);
  });
});
