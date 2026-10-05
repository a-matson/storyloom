import { expect, test, type Page } from '@playwright/test';

const IMAGES = 'http://localhost:7999';
// 1x1 transparent PNG, the smallest thing an A1111 server can honestly return.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

/** Demo backend plus the mocked image server, into a fantasy adventure. */
async function openAdventure(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill(`${IMAGES}/`);
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('sd_xl_base.safetensors')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
}

/** `/see <prompt>`: the slash command only switches mode, so the prompt is sent by the second click. */
async function see(page: Page, prompt: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(`/see ${prompt}`);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Send' }).click();
}

test('See mode generates an image, keeps the caption and survives a reload', async ({ page }) => {
  const prompts: string[] = [];
  // A real render takes minutes, so one call is held back to show the waiting state.
  let delayMs = 0;
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    prompts.push((route.request().postDataJSON() as { prompt: string }).prompt);
    if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
    return route.fulfill({ json: { images: [PNG] } });
  });

  await openAdventure(page);

  delayMs = 3000;
  await see(page, 'a harbour at dusk');

  // The counter ticks while the server works: without it two minutes of "Generating…" reads as broken.
  await expect(page.getByRole('figure')).toContainText(/Generating… [1-9]\d* s/);
  delayMs = 0;

  await expect(page.getByRole('figure')).toContainText('a harbour at dusk');
  const image = page.getByRole('img', { name: 'a harbour at dusk' });
  await expect(image).toBeVisible();
  expect(prompts).toEqual(['a harbour at dusk']);

  // The blob is in IndexedDB, not in the action: the picture comes back after a reload.
  await page.reload();
  await expect(page.getByRole('img', { name: 'a harbour at dusk' })).toBeVisible();
  expect(prompts).toHaveLength(1);

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('a-harbour-at-dusk.png');

  // Editing the caption regenerates: a second txt2img call with the new prompt.
  const caption = page.getByRole('figure').locator('figcaption');
  await caption.dblclick();
  await caption.fill('a harbour at dawn');
  await page.getByRole('figure').click({ position: { x: 1, y: 1 } });
  // The caption changes on the spot; the picture follows when the server answers.
  await expect.poll(() => prompts).toEqual(['a harbour at dusk', 'a harbour at dawn']);
  await expect(page.getByRole('img', { name: 'a harbour at dawn' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('figure')).toBeHidden();
});

test('a failed render, and one a reload abandoned, both offer Retry', async ({ page }) => {
  let calls = 0;
  let fail = true;
  let hang = false;
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    calls += 1;
    if (hang) return new Promise(() => undefined); // never answers: the reload abandons it
    if (fail) return route.fulfill({ status: 500, body: 'no model loaded' });
    return route.fulfill({ json: { images: [PNG] } });
  });

  await openAdventure(page);
  await see(page, 'a harbour at dusk');

  const figure = page.getByRole('figure');
  await expect(figure).toContainText('Could not generate this image');
  // The prompt survives the failure, so Retry has something to send.
  await expect(figure).toContainText('a harbour at dusk');
  // The toast says why; it sits over the command row, so it goes before the next turn.
  await expect(page.getByRole('alert')).toContainText('Could not generate the image');
  await page.getByRole('button', { name: 'dismiss' }).click();

  fail = false;
  await figure.getByRole('button', { name: 'Retry' }).first().click();
  await expect(page.getByRole('img', { name: 'a harbour at dusk' })).toBeVisible();
  expect(calls).toBe(2);

  // A render the reload killed: no job is left behind it, so the block must not claim it is still generating.
  hang = true;
  await see(page, 'a lantern');
  await expect(page.getByText('Generating…')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Generating…/)).toBeHidden();
  await expect(page.locator('figure', { hasText: 'a lantern' })).toContainText('Could not generate this image');
});
