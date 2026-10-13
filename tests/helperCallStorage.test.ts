import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { describe, expect, it } from 'vitest';
import { DexieStorage } from '@adapters/storage';
import { StoryloomDb } from '@adapters/storage/dexie/db';
import { splitAdventure } from '@adapters/storage/dexie/rows';
import type { HelperCall } from '@core/model';
import { HELPER_CALL_CAP_PER_ADVENTURE } from '@core/ports';
import { makeAdventure } from './fixtures/adventure';
import { makeTrace } from './fixtures/trace';

let n = 0;
async function fresh(name = `helper-${++n}`): Promise<DexieStorage> {
  const s = new DexieStorage(name);
  await s.init();
  return s;
}

const helper = (i: number, adventureId: string): HelperCall => ({
  id: `h${i}`,
  adventureId,
  createdAt: i,
  actionCount: 3,
  job: 'entity',
  ms: 10,
  promptHash: 'p',
  generatedTokens: 4,
  cut: false,
  reply: '{}',
  accepted: 0,
  rejected: [],
});

describe('DexieStorage helper calls', () => {
  it('round-trips newest first, prunes past the cap and deletes them with the adventure', async () => {
    const name = `helper-${++n}`;
    const s = await fresh(name);
    const adv = makeAdventure({ actions: 2 });
    await s.putAdventure(adv);
    // A full table in one write; the two puts after it go through the pruning path.
    const db = new StoryloomDb(name);
    await db.helperCalls.bulkPut(Array.from({ length: HELPER_CALL_CAP_PER_ADVENTURE }, (_, i) => helper(i, adv.id)));
    db.close();
    for (const i of [HELPER_CALL_CAP_PER_ADVENTURE, HELPER_CALL_CAP_PER_ADVENTURE + 1]) await s.putHelperCall(helper(i, adv.id));
    await s.putHelperCall(helper(0, 'elsewhere'));
    const kept = await s.listHelperCalls(adv.id);
    expect(kept).toHaveLength(HELPER_CALL_CAP_PER_ADVENTURE);
    expect(kept[0]).toEqual(helper(HELPER_CALL_CAP_PER_ADVENTURE + 1, adv.id));
    expect(kept.at(-1)?.id).toBe('h2');
    await s.deleteAdventure(adv.id);
    expect(await s.listHelperCalls(adv.id)).toEqual([]);
    expect(await s.listHelperCalls('elsewhere')).toHaveLength(1);
  });

  it('upgrades a version-4 database to 5 and keeps adventures and traces', async () => {
    const name = `helper-${++n}`;
    const adv = makeAdventure({ actions: 3 });
    const old = new Dexie(name);
    old.version(1).stores({
      adventures: 'id, updatedAt',
      actions: '[adventureId+seq], adventureId',
      storyCards: '[adventureId+id], adventureId',
      memories: '[adventureId+id], adventureId',
      scenarios: 'id, updatedAt',
      settings: '',
    });
    old.version(2).stores({ traces: 'turnId, adventureId, [adventureId+createdAt]' });
    old.version(3).stores({ images: '[adventureId+id], adventureId' });
    old.version(4).stores({ entities: '[adventureId+id], adventureId' });
    await old.open();
    const rows = splitAdventure(adv);
    await old.table('adventures').put(rows.meta);
    await old.table('actions').bulkPut(rows.actions);
    await old.table('traces').put(makeTrace({ turnId: 'old', adventureId: adv.id }));
    old.close();

    const s = await fresh(name);
    expect((await s.getAdventure(adv.id))?.actions).toEqual(adv.actions);
    expect(await s.getTrace('old')).toBeDefined();
    await s.putHelperCall(helper(1, adv.id));
    expect(await s.listHelperCalls(adv.id)).toHaveLength(1);
  });
});
