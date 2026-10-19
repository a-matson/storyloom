import { chromium } from '@playwright/test';
import { test } from 'vitest';
import { z } from 'zod/mini';
import { ownedBlobIds } from '@core/image/candidates';
import * as S from '@core/schema';
import { writeMeasurement } from './env';

// M29-12: stored image blobs no adventure owns, read from the player's open app over CDP (images are not in backups).
// Start the browser with `--remote-debugging-port=9222`, open Storyloom, then `pnpm measure orphans http://localhost:9222 [label]`.
const { MEASURE_CDP: cdp, MEASURE_LABEL: LABEL = 'baseline' } = process.env;

const Owner = z.object({ adventureId: z.string() });
const Db = z.object({
  images: z.array(z.tuple([z.string(), z.string()])),
  adventures: z.array(z.object({ id: z.string(), coverId: z.optional(z.string()) })),
  actions: z.array(z.unknown()),
  entities: z.array(z.unknown()),
});

test.skipIf(!cdp)('orphan image blobs per adventure', async () => {
  const browser = await chromium.connectOverCDP(cdp ?? '');
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /storyloom|localhost/i.test(p.url()));
  if (!page) throw new Error('no open Storyloom page');
  const raw = await page.evaluate(async () => {
    const req = indexedDB.open('storyloom');
    const idb = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    // Keys only for images: the blobs stay in the browser.
    const all = (store: string, keys = false) =>
      new Promise<unknown[]>((ok, fail) => {
        const s = idb.transaction(store).objectStore(store);
        const r = keys ? s.getAllKeys() : s.getAll();
        r.addEventListener('success', () => ok(r.result));
        r.addEventListener('error', () => fail(r.error));
      });
    const out = { images: await all('images', true), adventures: await all('adventures'), entities: await all('entities'), actions: await all('actions') };
    idb.close();
    return out;
  });
  await browser.close();
  const db = Db.parse(raw);
  const of = <T>(rows: unknown[], id: string, schema: z.ZodMiniType<T>) => rows.filter((r) => Owner.parse(r).adventureId === id).map((r) => schema.parse(r));
  const byAdventure = db.adventures.map((a) => {
    const owned = ownedBlobIds({
      actions: of(db.actions, a.id, S.Action),
      entities: of(db.entities, a.id, S.Entity),
      ...(a.coverId !== undefined && { coverId: a.coverId }),
    });
    const stored = db.images.filter(([adv]) => adv === a.id).map(([, id]) => id);
    const ids = stored.filter((id) => !owned.has(id));
    return { adventureId: a.id, stored: stored.length, owned: owned.size, orphans: ids.length, ids };
  });
  const known = new Set(db.adventures.map((a) => a.id));
  const noAdventure = db.images.filter(([adv]) => !known.has(adv)).length;
  console.log('orphans', JSON.stringify(byAdventure.map(({ ids: _i, ...r }) => r)), 'no adventure:', noAdventure);
  console.log('wrote', writeMeasurement(`orphans-${LABEL}`, { byAdventure, noAdventure }));
});
