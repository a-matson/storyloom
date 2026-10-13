import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { expect, it } from 'vitest';
import { DexieStorage } from '@adapters/storage';
import { mergeEntity } from '@core/memory/entities';
import type { Adventure } from '@core/model';
import { makeAdventure } from './fixtures/adventure';
import { told } from './fixtures/assertions';

const NAME = 'test-assertions';
async function reopen(): Promise<DexieStorage> {
  const s = new DexieStorage(NAME);
  await s.init();
  return s;
}
const texts = (a?: Adventure) => a?.assertions.map((x) => (x.kind === 'identity' || x.kind === 'trait' ? x.text : x.kind)).toSorted();
async function raw(fn: (db: Dexie) => Promise<unknown>): Promise<unknown> {
  const db = new Dexie(NAME);
  await db.open();
  const out = await fn(db);
  db.close();
  return out;
}

it('saves the assertions the writers made, edits and removals included', async () => {
  const tam = mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 2);
  const said = told(tam, { description: 'A ferrywoman.', facts: ['She rows.'] }, 2);
  const adv = { ...makeAdventure({ actions: 4, cards: 0 }), entities: [tam], assertions: said };
  const s = await reopen();
  await s.putAdventure(adv);
  expect(texts(await (await reopen()).getAdventure(adv.id))).toEqual(['A ferrywoman.', 'She rows.']);
  await s.putAdventure({ ...adv, assertions: said.slice(1) });
  expect(texts(await (await reopen()).getAdventure(adv.id))).toEqual(['She rows.']);
  await s.deleteAdventure(adv.id);
});

it('moves entity facts to assertions once, on open, for an adventure saved before the store', async () => {
  const tam = {
    ...mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 2),
    description: 'A ferrywoman.',
    facts: [{ id: 'fact_1', text: 'She rows.', fromAction: 2, source: 'memory' as const }],
  };
  const adv = { ...makeAdventure({ actions: 4, cards: 0 }), entities: [tam] };
  await (await reopen()).putAdventure(adv);
  expect(await raw((db) => db.table('assertions').count())).toBe(0); // as a v5 save left it
  const opened = await (await reopen()).getAdventure(adv.id);
  expect(texts(opened)).toEqual(['A ferrywoman.', 'She rows.']);
  // Written on that open: the rows hold the store, the entity row no legacy field.
  expect(await raw((db) => db.table('assertions').count())).toBe(2);
  expect(await raw((db) => db.table('entities').toArray())).toEqual([expect.not.objectContaining({ facts: expect.anything() })]);
  expect(await raw((db) => db.table('entities').toArray())).toEqual([expect.objectContaining({ description: '' })]);
  // A player who then deletes every line gets none back on the next open.
  if (!opened) throw new Error('missing');
  const s = await reopen();
  await s.getAdventure(adv.id);
  await s.putAdventure({ ...opened, assertions: [] });
  expect(texts(await (await reopen()).getAdventure(adv.id))).toEqual([]);
  await s.deleteAdventure(adv.id);
  expect(await raw((db) => db.table('assertions').count())).toBe(0);
});
