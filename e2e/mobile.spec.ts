import { expect, test } from '@playwright/test';

const STORY = 'http://localhost:9995';

test.use({ viewport: { width: 390, height: 844 } });

test('the soft keyboard shrinks the story view and keeps the turn input visible', async ({ page }) => {
  // Headless Chromium has no soft keyboard: a settable visualViewport stands in for it.
  await page.addInitScript(() => {
    const vv = Object.assign(new EventTarget(), { height: window.innerHeight, width: window.innerWidth, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { value: vv });
  });
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  const input = page.getByRole('textbox', { name: 'Take a turn' });
  const story = page.locator('#story').locator('..');
  const setHeight = (h: number) =>
    page.evaluate((height) => {
      const vv = window.visualViewport;
      if (!vv) throw new Error('no visualViewport');
      Object.assign(vv, { height }).dispatchEvent(new Event('resize'));
    }, h);

  await input.focus();
  const full = (await story.boundingBox())?.height ?? 0;

  await setHeight(500);
  await expect.poll(async () => (await input.boundingBox())?.y).toBeLessThan(500);
  const box = await input.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(500);
  expect((await story.boundingBox())?.height ?? 0).toBeLessThan(full);

  await setHeight(844);
  await expect.poll(async () => (await story.boundingBox())?.height).toBe(full);
});
