import { expect, test } from '@playwright/test';

const STORY = 'http://localhost:9994';

test('a banned phrase flags the output; the retry carries the note', async ({ page }) => {
  const prompts: string[] = [];
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    prompts.push(prompt);
    const content = prompt.includes('Never write') ? ' The guard waves you on.' : ' His voice thick, the guard waves you on.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  await page.getByRole('tab', { name: 'Gameplay' }).click();
  const box = page.getByRole('textbox', { name: 'Never write (one per line)' });
  await box.fill('his voice thick');
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait at the gate');
  await page.getByRole('button', { name: 'Send' }).click();
  const badge = page.getByRole('status').filter({ hasText: 'Uses "his voice thick"' });
  await expect(badge).toBeVisible();

  await page.getByRole('button', { name: 'Retry without it' }).click();
  await expect(badge).toBeHidden();
  expect(prompts.filter((p) => p.includes('[Note: keep to this: Never write "his voice thick".]'))).toHaveLength(1);

  await page.reload();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await expect(page.getByRole('textbox', { name: 'Never write (one per line)' })).toHaveValue('his voice thick');
});
