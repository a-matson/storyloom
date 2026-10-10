import type { Page } from '@playwright/test';
import type { Entity } from '@core/model';
import { OUT_DIR } from './env';

/**
 * What landed in IndexedDB for each portrait, decoded the way the app shows it; the characters left without one;
 * plus a Characters tab screenshot.
 */
export async function portraits(page: Page, entities: Entity[]) {
  const ids = entities.flatMap((e) => (e.portraitId === undefined ? [] : [{ name: e.name, id: e.portraitId }]));
  const stored = await page.evaluate(async (wanted) => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const rows = await new Promise<{ id: string; blob: Blob }[]>((ok, fail) => {
      const r = db.transaction('images').objectStore('images').getAll();
      r.addEventListener('success', () => ok(r.result as { id: string; blob: Blob }[]));
      r.addEventListener('error', () => fail(r.error));
    });
    db.close();
    return Promise.all(
      wanted.map(async ({ name, id }) => {
        const blob = rows.find((r) => r.id === id)?.blob;
        if (!blob) return { name, stored: false };
        const bitmap = await createImageBitmap(blob);
        return { name, stored: true, type: blob.type, bytes: blob.size, width: bitmap.width, height: bitmap.height };
      }),
    );
  }, ids);
  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.screenshot({ path: `${OUT_DIR}/${new Date().toISOString().slice(0, 10)}-portraits.png` });
  const faceless = entities.filter((e) => e.kind === 'character' && e.portraitId === undefined).map((e) => e.name);
  return { stored, faceless };
}
