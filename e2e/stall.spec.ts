import { expect, test } from '@playwright/test';

const STORY = 'http://localhost:9995';

test('a turn whose stream never starts fails as stalled, and Continue recovers', async ({ page }) => {
  let stall = true;
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 2 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    // Headers never come: the request just hangs, as on a server busy with another slot.
    if (stall && prompt.includes('wait at the gate')) return;
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"content":"The gate stays shut.","stop":true}\n\n' });
  });
  // The watchdog is 90 s; the fake clock gets there without waiting.
  await page.clock.install();

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait at the gate');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await page.clock.fastForward('01:31');
  await expect(page.getByRole('alert')).toContainText('The model sent nothing for 90 s');

  stall = false;
  // The toast sits over the command row until dismissed.
  await page.getByRole('button', { name: 'dismiss' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('The gate stays shut.')).toBeVisible();
});
