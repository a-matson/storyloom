import { expect, test, type Page } from '@playwright/test';

const STORY = 'http://localhost:9995';
const OUTCOME = /\[Outcome: (succeeds|succeeds at a cost|fails badly)\]/;

/** Connects to a mocked story server and returns every prompt it was sent. */
async function connect(page: Page): Promise<string[]> {
  const prompts: string[] = [];
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt, grammar, n_predict, id_slot } = route.request().postDataJSON() as { prompt: string; grammar?: string; n_predict: number; id_slot?: number };
    // Story turns only: helper reads carry a grammar or run on slot 1, warming predicts nothing.
    if (!grammar && n_predict > 0 && id_slot !== 1 && /You (climb|say)/.test(prompt)) prompts.push(prompt);
    // A repeated reply would be re-rolled.
    const content = [' The rain keeps on.', ' A shutter bangs above.', ' Boots ring on stone.'][prompts.length % 3];
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  return prompts;
}

/** A Do turn's prompt ends with the outcome; a Say turn's has none. */
async function doThenSay(page: Page, prompts: string[]): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  await input.fill('climb the wall');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => prompts.length).toBe(1);
  expect(prompts[0]?.split('\n').find((l) => l.startsWith('[Outcome:'))).toMatch(OUTCOME);
  await page.getByRole('button', { name: 'Say' }).click();
  await input.fill('Open up!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => prompts.length).toBe(2);
  expect(prompts[1]).not.toContain('[Outcome:');
}

test('the dice quick start tells the model the outcome of a Do', async ({ page }) => {
  const prompts = await connect(page);
  await page.getByRole('button', { name: 'Consequences (dice)' }).click();
  await doThenSay(page, prompts);
  // A Continue after a Do clears the outcome: front memory lives in script state now.
  await page.getByRole('button', { name: 'Do', exact: true }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('climb the wall');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => prompts.length).toBe(3);
  expect(prompts[2]).toMatch(OUTCOME);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  // The gate may re-roll the reply; neither prompt carries the outcome.
  await expect.poll(() => prompts.length).toBeGreaterThanOrEqual(4);
  for (const p of prompts.slice(3)) expect(p).not.toContain('[Outcome:');
});

test('the Gameplay switch puts the dice on a plain story', async ({ page }) => {
  const prompts = await connect(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Consequences', { exact: true }).click();
  const dice = page.getByRole('switch', { name: 'Dice outcomes' });
  await dice.click();
  await expect(dice).toBeChecked();
  await doThenSay(page, prompts);
});
