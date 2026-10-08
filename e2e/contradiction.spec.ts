import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

const UTILITY = 'http://localhost:9997';

test('a contradicting output gets a badge until it is retried', async ({ page }) => {
  let checks = 0;
  await page.route(`${UTILITY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    // Only the first check flags: the retried output is fine.
    const content = prompt.includes('Established facts:')
      ? JSON.stringify(++checks === 1 ? { contradicts: true, fact: 'Scene: The salt flats' } : { contradicts: false, fact: '' })
      : 'The traveller walked the Salt Road.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'The salt flats', present: [] }, utility: `${UTILITY}/` });

  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByRole('switch', { name: 'Check each turn for contradictions' }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  const badge = page.getByRole('status').filter({ hasText: 'May contradict: Scene: The salt flats' });
  await expect(badge).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(badge).toBeHidden();
  await expect.poll(() => checks).toBe(2);
  await expect(badge).toBeHidden();
});
