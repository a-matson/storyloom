import { expect, test, type Page } from '@playwright/test';

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

/** A Fantasy quick start on a mocked server; returns the story prompts sent. */
async function open(page: Page): Promise<string[]> {
  const prompts: string[] = [];
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt, grammar, n_predict, id_slot } = route.request().postDataJSON() as { prompt: string; grammar?: string; n_predict: number; id_slot?: number };
    // Story turns only: helper reads carry a grammar or run on slot 1, warming predicts nothing.
    if (!grammar && n_predict > 0 && id_slot !== 1) prompts.push(prompt);
    // Unique per reply, so the output gate never re-rolls one as a repeat.
    const content = `and the ${['square', 'road', 'fire', 'gate', 'tower', 'river', 'hall', 'well'][prompts.length % 8]} falls silent.`;
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  return prompts;
}

test('/complicate opens the reply with a genre card, and the next one draws another', async ({ page }) => {
  const prompts = await open(page);
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

test('the director plays a labelled turn after every 3 player turns, × erases it, and off plays none', async ({ page }) => {
  const prompts = await open(page);
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Director', { exact: true }).click();
  const director = page.getByRole('combobox', { name: 'Director turns' });
  await director.selectOption('3');
  const label = page.locator('#story').getByText('director', { exact: true });
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  const take = async (text: string) => {
    const before = prompts.length;
    await input.fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => prompts.length).toBeGreaterThan(before);
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  };

  for (const t of ['look around', 'walk on', 'wait']) await take(t);
  await expect(label).toBeVisible();
  // The director's Continue is a fourth story prompt, ending in a deck card (nobody is present to play a beat).
  await expect.poll(() => prompts.length).toBe(4);
  expect(FANTASY_DECK.some((c) => prompts[3]?.endsWith(c))).toBe(true);
  await page.getByRole('button', { name: 'Erase director turn' }).click();
  await expect(label).toBeHidden();

  await director.selectOption('off');
  for (const t of ['sit down', 'stand up', 'listen']) await take(t);
  await page.waitForTimeout(500);
  expect(prompts).toHaveLength(7);
  await expect(label).toBeHidden();
});
