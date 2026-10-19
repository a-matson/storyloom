import { expect, test } from '@playwright/test';

const STORY = 'http://localhost:9995';
const FANTASY_DECK = [
  'Just then, a rider comes ',
  'The weather turns: ',
  'A raven lands with a message: "',
  'A bell rings out from the town, ',
  'An old wound flares, ',
  'Someone who is owed a debt appears: ',
  'Something moves in the dark, ',
];

test('/complicate opens the reply with a genre card, and the next one draws another', async ({ page }) => {
  const prompts: string[] = [];
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt, grammar, n_predict, id_slot } = route.request().postDataJSON() as { prompt: string; grammar?: string; n_predict: number; id_slot?: number };
    // Story turns only: helper reads carry a grammar or run on slot 1, warming predicts nothing.
    if (!grammar && n_predict > 0 && id_slot !== 1) prompts.push(prompt);
    const content = ['and the square falls silent.', 'and nobody moves.', 'and the fire gutters.'][prompts.length % 3];
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  const input = page.getByRole('textbox', { name: 'Take a turn' });
  const cues: string[] = [];
  for (const n of [1, 2]) {
    await input.fill('/complicate');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => prompts.length).toBeGreaterThanOrEqual(n);
    const cue = FANTASY_DECK.find((c) => prompts.at(-1)?.endsWith(c));
    expect(cue).toBeDefined();
    await expect(page.locator('#story').getByText(cue?.trim() ?? '', { exact: false })).toBeVisible();
    cues.push(cue ?? '');
  }
  expect(cues[1]).not.toBe(cues[0]);
});
