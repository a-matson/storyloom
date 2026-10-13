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

it('derives them once on open for an adventure saved before the table', async () => {
  const tam = {
    ...mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: 'A ferrywoman.' }, 2),
    facts: [{ id: 'fact_1', text: 'She rows.', fromAction: 2, source: 'memory' as const }],
  };
  const adv = { ...makeAdventure({ actions: 4, cards: 0 }), entities: [tam] };
  await (await reopen()).putAdventure(adv);
  expect(await raw((db) => db.table('assertions').count())).toBe(0); // as a v5 save left it
  const s = await reopen();
  const opened = await s.getAdventure(adv.id);
  expect(texts(opened)).toEqual(['A ferrywoman.', 'She rows.']);
  if (!opened) throw new Error('missing');
  await s.putAdventure(opened);
  expect(await raw((db) => db.table('assertions').count())).toBe(2);
  await s.deleteAdventure(adv.id);
  expect(await raw((db) => db.table('assertions').count())).toBe(0);
});
