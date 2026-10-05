import { expect, test, type Page } from '@playwright/test';
import { writeMeasurement } from '../../bench/env';

// `pnpm measure images <image-server-url> <llama-server-url>`: the real app against a real
// A1111 server (Forge, SD.Next, KoboldCpp --sdmodel). Never runs in CI.
const IMAGES = process.env['MEASURE_IMAGES'];
const URL = process.env['MEASURE_URL'];
test.skip(!IMAGES || !URL, 'needs MEASURE_IMAGES (an A1111 server) and MEASURE_URL (a llama-server)');

// A 768px/24-step image takes minutes on a laptop GPU, not seconds. [measured: 2026-10-05-live-images.json]
const GEN_MS = 1_200_000;
const TURN_MS = 180_000;

/** Blob sizes, so the measurement says what actually landed in IndexedDB. */
function imageBytes(page: Page) {
  return page.evaluate(async () => {
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
    return rows.map((row) => ({ id: row.id, bytes: row.blob.size, type: row.blob.type }));
  });
}

test('a real image server renders a See image and a cover', async ({ page }) => {
  test.setTimeout(90 * 60_000);
  const ms: Record<string, number> = {};
  const timed = async (name: string, job: () => Promise<void>) => {
    const t = Date.now();
    await job();
    ms[name] = Date.now() - t;
  };

  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();

  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill(IMAGES ?? '');
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  // The checkpoint list is the only proof the real /sdapi/v1/sd-models shape parses.
  const checkpoints = page.getByText(/^Connected · \d+ checkpoints/);
  await expect(checkpoints).toBeVisible();
  const models = (await checkpoints.textContent()) ?? '';
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  // One real turn first: the auto-prompt reads the story tail, so it needs a story.
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around and take in the place');
  await timed('turn', async () => {
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: TURN_MS });
  });

  // See with a blank prompt: the helper model writes the tag line, the image server draws it.
  await page.getByRole('button', { name: 'See', exact: true }).click();
  await timed('seeAuto', async () => {
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('figure').getByRole('img')).toBeVisible({ timeout: GEN_MS });
  });
  const caption = (await page.getByRole('figure').locator('figcaption').textContent()) ?? '';
  const seen = await page
    .getByRole('figure')
    .getByRole('img')
    .evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
  expect(seen.w).toBeGreaterThan(0);

  // A generated cover, from the adventure's own image settings.
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByPlaceholder(/lantern-lit tavern/).fill('a lantern-lit tavern, rainy night, painted illustration');
  const generate = page.getByRole('button', { name: 'Generate', exact: true });
  await timed('cover', async () => {
    await generate.click();
    // The picker disables itself while it generates; enabled again means the blob is stored.
    await expect(generate).toBeDisabled();
    await expect(generate).toBeEnabled({ timeout: GEN_MS });
  });

  const blobs = await imageBytes(page);
  // One See image and one cover; a failed generation leaves nothing behind.
  expect(blobs.length).toBe(2);

  const path = writeMeasurement('live-images', { imageServer: IMAGES, url: URL, models, ms, caption, seen, blobs });
  console.log(`wrote ${path}`);
});
