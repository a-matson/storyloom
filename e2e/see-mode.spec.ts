import { expect, test } from '@playwright/test';

const IMAGES = 'http://localhost:7999';
// 1x1 transparent PNG, the smallest thing an A1111 server can honestly return.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

test('See mode generates an image, keeps the caption and survives a reload', async ({ page }) => {
  const prompts: string[] = [];
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    prompts.push((route.request().postDataJSON() as { prompt: string }).prompt);
    return route.fulfill({ json: { images: [PNG] } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill(`${IMAGES}/`);
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('sd_xl_base.safetensors')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('/see a harbour at dusk');
  await page.getByRole('button', { name: 'Send' }).click();
  // The slash command only switches mode; the second send submits the prompt.
  await page.getByRole('button', { name: 'Send' }).click();

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
