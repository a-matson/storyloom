import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

const IMAGES = 'http://localhost:7999';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('re-renders stay as candidates until one is kept, across a reload', async ({ page }) => {
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { images: [PNG] } });
  });
  await openSeededAdventure(page, 3, `${IMAGES}/`);
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('/see a red door');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Send' }).click();
  const figure = page.getByRole('figure');
  await expect(figure.getByRole('img', { name: 'a red door' })).toBeVisible();

  // A brief edit and a Retry: three renders, the newest shown.
  const caption = figure.locator('figcaption');
  await caption.dblclick();
  await caption.fill('a blue door');
  await figure.click({ position: { x: 1, y: 1 } });
  await expect(figure.getByRole('img', { name: 'a blue door' })).toBeVisible();
  await figure.getByRole('button', { name: 'Retry' }).click();
  const render = figure.getByLabel('Render', { exact: true });
  await expect(render).toHaveText('3 / 3');

  await page.reload();
  await expect(render).toHaveText('3 / 3');
  await figure.getByRole('button', { name: 'Next render' }).click();
  await expect(render).toHaveText('1 / 3');
  await expect(figure.getByRole('img', { name: 'a red door' })).toBeVisible();
  await figure.getByRole('button', { name: 'Keep this' }).click();
  await expect(render).toBeHidden();
  await expect(figure.getByRole('img', { name: 'a red door' })).toBeVisible();

  await page.reload();
  await expect(figure.getByRole('img', { name: 'a red door' })).toBeVisible();
  await expect(render).toBeHidden();
});
