import { expect, test, type Page } from '@playwright/test';
import { writeMeasurement } from '../../bench/env';

// MEASURE_IMAGES=<a1111 url> MEASURE_URL=<llama-server url> pnpm exec playwright test --project=live e2e/live/compose.spec.ts
// Three See briefs against the real pair: what each one sent, and whether a character name leaked. Never runs in CI.
const IMAGES = process.env['MEASURE_IMAGES'];
const URL = process.env['MEASURE_URL'];
test.skip(!IMAGES || !URL, 'needs MEASURE_IMAGES (an A1111 server) and MEASURE_URL (a llama-server)');

const GEN_MS = 1_200_000;
const TURN_MS = 180_000;
const TAMSIN = {
  id: 'ent_tamsin',
  kind: 'character',
  name: 'Tamsin',
  aliases: ['the ferrywoman'],
  description: 'Tamsin is a ferrywoman who poles travellers across the river.',
  appearance: 'weathered woman, long grey braid, patched blue cloak',
  state: {},
  facts: [],
  relations: [],
  firstSeen: 0,
  lastSeen: 1,
};
const SCENE = { location: 'a wooden ferry on a wide river', present: ['Tamsin'], weather: 'light rain' };

/** Tamsin, the scene, and portraits off (they would queue behind the See renders) — written while no session holds the adventure. */
async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ({ tamsin, scene }) => {
      const req = indexedDB.open('storyloom');
      const db = await new Promise<IDBDatabase>((ok, fail) => {
        req.addEventListener('success', () => ok(req.result));
        req.addEventListener('error', () => fail(req.error));
      });
      type Adv = { id: string; plot: object; settings: { image: object } };
      const adv = await new Promise<Adv | undefined>((ok, fail) => {
        const r = db.transaction('adventures').objectStore('adventures').getAll();
        r.addEventListener('success', () => ok((r.result as Adv[])[0]));
        r.addEventListener('error', () => fail(r.error));
      });
      if (!adv) throw new Error('no adventure');
      // The turn's memory cycle may already have a Tamsin: give that one the looks rather than a twin.
      const existing = await new Promise<{ name: string }[]>((ok, fail) => {
        const r = db.transaction('entities').objectStore('entities').getAll();
        r.addEventListener('success', () => ok(r.result as { name: string }[]));
        r.addEventListener('error', () => fail(r.error));
      });
      const hers = existing.find((e) => e.name === tamsin.name);
      const tx = db.transaction(['entities', 'adventures'], 'readwrite');
      tx.objectStore('adventures').put({
        ...adv,
        plot: { ...adv.plot, scene },
        settings: { ...adv.settings, image: { ...adv.settings.image, portraits: false } },
      });
      tx.objectStore('entities').put(hers ? { ...hers, appearance: tamsin.appearance } : { ...tamsin, adventureId: adv.id });
      await new Promise((ok) => tx.addEventListener('complete', ok));
      db.close();
    },
    { tamsin: TAMSIN, scene: SCENE },
  );
}

test('three See briefs send looks, never names', async ({ page }) => {
  test.setTimeout(90 * 60_000);
  const sent: { prompt: string; ms: number }[] = [];
  let t0 = 0;
  page.on('request', (r) => {
    if (!r.url().includes('/sdapi/v1/txt2img')) return;
    const { prompt } = r.postDataJSON() as { prompt: string };
    // A portrait the opening queued before the seed turned them off.
    if (prompt.startsWith('portrait')) return;
    t0 = Date.now();
    sent.push({ prompt, ms: 0 });
  });
  page.on('response', (r) => {
    const last = sent.at(-1);
    if (r.url().includes('/sdapi/v1/txt2img') && last) last.ms = Date.now() - t0;
  });

  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill(IMAGES ?? '');
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText(/^Connected · \d+ checkpoints/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  // One turn about Tamsin, so the helper has a story to resolve "she" from.
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('call out to the ferrywoman, Tamsin, and step aboard her ferry');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: TURN_MS });

  await page.goto('/#/');
  await expect(page.getByRole('button', { name: /^Continue / }).first()).toBeVisible();
  // The closing session's save is async; a seed written before it lands is overwritten.
  await page.waitForTimeout(3000);
  await seed(page);
  await page.reload();
  await page
    .getByRole('button', { name: /^Continue / })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await page.getByRole('button', { name: /^Characters/ }).click();
  await expect(page.getByRole('button', { name: 'Open Tamsin' })).toBeVisible();

  const briefs = ['Tamsin at the ferry', 'she turns to face me', ''];
  for (const [i, brief] of briefs.entries()) {
    await page.getByRole('button', { name: 'See', exact: true }).click();
    await page.getByRole('textbox', { name: 'Take a turn' }).fill(brief);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('figure').nth(i).getByRole('img')).toBeVisible({ timeout: GEN_MS });
  }

  const rows = sent.map((s, i) => ({ brief: briefs[i], ...s, hasName: /tamsin/i.test(s.prompt), hasLooks: /grey braid/i.test(s.prompt) }));
  const shot = 'docs/measurements/2026-10-10-compose.png';
  // The story column scrolls, so the three images are copied side by side into one overlay for the screenshot.
  await page.evaluate(() => {
    const row = document.createElement('div');
    row.id = 'compose-row';
    row.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;gap:8px;padding:8px;background:#111';
    for (const img of document.querySelectorAll<HTMLImageElement>('figure img')) {
      const copy = img.cloneNode() as HTMLImageElement;
      copy.style.cssText = 'width:400px;height:400px;object-fit:cover';
      row.append(copy);
    }
    document.body.append(row);
  });
  await page.locator('#compose-row').screenshot({ path: shot });
  console.log(`wrote ${writeMeasurement('compose', { imageServer: IMAGES, url: URL, rows, screenshot: shot })}`);
  expect(rows.map((r) => r.hasName)).toEqual([false, false, false]);
});
