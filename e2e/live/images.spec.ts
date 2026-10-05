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

/**
 * Every txt2img exchange and console line, so the measurement says what the server was asked
 * and what it answered. Base64 payloads are reduced to a head + length; the point is the shape.
 */
function capture(page: Page) {
  const calls: Record<string, unknown>[] = [];
  const console_: string[] = [];
  page.on('request', (r) => {
    if (!r.url().includes('/sdapi/v1/txt2img')) return;
    calls.push({ at: new Date().toISOString(), url: r.url(), body: r.postData()?.slice(0, 2000) });
  });
  page.on('response', (r) => {
    if (!r.url().includes('/sdapi/v1/txt2img')) return;
    const call = calls.at(-1) ?? {};
    void (async () => {
      try {
        const first = (JSON.parse(await r.text()) as { images?: unknown[] }).images?.[0];
        Object.assign(call, { status: r.status(), head: String(first).slice(0, 32), length: String(first).length });
      } catch (e) {
        Object.assign(call, { status: r.status(), bodyError: String(e) });
      }
    })();
  });
  page.on('console', (m) => console_.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => console_.push(`pageerror: ${e.message}`));
  return { calls, console_ };
}

test('a real image server renders a See image and a cover', async ({ page }) => {
  test.setTimeout(90 * 60_000);
  const captured = capture(page);
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
    // Send is replaced by Stop while the model streams; waiting for Send alone passes instantly
    // and timed the click, not the turn.
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: TURN_MS });
  });

  // See with a blank prompt: the helper model writes the tag line, the image server draws it.
  await page.getByRole('button', { name: 'See', exact: true }).click();
  await timed('seeAuto', async () => {
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('figure').getByRole('img')).toBeVisible({ timeout: GEN_MS });
  });
  // Our own images are blobs; a `url` src would mean imported data, not a real render.
  await expect(page.getByRole('figure').getByRole('img')).toHaveAttribute('src', /^blob:/);
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

  // A second See, left in flight: a turn taken while it renders, then a reload mid-generation.
  // Both are on the user's path, and the reload is the evidence play fix 2 needs.
  await page.getByRole('button', { name: 'See', exact: true }).click();
  await page.getByRole('button', { name: 'Send' }).click();
  const generating = page.getByText(/Generating… \d+ s/);
  await expect(generating).toBeVisible({ timeout: TURN_MS });
  await page.getByRole('button', { name: 'Do', exact: true }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('listen for footsteps on the stair');
  await timed('turnDuringImage', async () => {
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: TURN_MS });
  });
  const counter = (await generating.textContent()) ?? '';
  await page.reload();
  // The stored image comes back from IndexedDB; nothing resumes the render that was in flight,
  // so the last block stays where it is — what it says is the finding play fix 2 works from.
  await expect(page.getByRole('figure').first().getByRole('img')).toBeVisible();
  const afterReload = (await page.getByRole('figure').last().textContent()) ?? '';

  const path = writeMeasurement('play-images', {
    imageServer: IMAGES,
    url: URL,
    models,
    ms,
    caption,
    seen,
    blobs,
    counter,
    afterReload,
    txt2img: captured.calls,
    console: captured.console_,
  });
  console.log(`wrote ${path}`);
});
