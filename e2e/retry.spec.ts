import { expect, test } from '@playwright/test';

const STORY = 'http://localhost:9995';

test('a retry hides the old output while it runs; Stop brings it back', async ({ page }) => {
  let hang = false;
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    // One slot: no prefetched alternative, so Retry really streams.
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    if (hang) return;
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"content":" The gate stays shut.","stop":true}\n\n' });
  });

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait at the gate');
  await page.getByRole('button', { name: 'Send' }).click();
  const old = page.locator('#story').getByText('The gate stays shut.');
  await expect(old).toBeVisible();

  hang = true;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('thinking…')).toBeVisible();
  await expect(old).toBeHidden();

  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(old).toBeVisible();
});
