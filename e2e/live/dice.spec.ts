import { expect, test } from '@playwright/test';
import { writeMeasurement } from '../../bench/env';

// `MEASURE_URL=http://localhost:8080 pnpm exec playwright test --project=live e2e/live/dice.spec.ts`: the dice quick start
// on a real model; every outcome and reply in full, labelled by hand (M21-5). Never runs in CI.
const URL = process.env['MEASURE_URL'];
test.skip(!URL, 'needs MEASURE_URL (a running llama-server)');

// Half carry a DC 14 keyword, half do not.
const ATTEMPTS = [
  'climb the wall beside the gate',
  'look for a way in along the moat',
  'sneak along the parapet toward the lit window',
  'listen at the shutters',
  'pick the lock on the tower door',
  'search the room for the strongbox',
  'persuade the guard on the stair to look away',
  'draw your knife and wait behind the door',
  'attack the man counting the coins',
  'grab the purse from the table',
  'jump from the window to the stable roof',
  'run for the stables',
  'steal a horse from the stalls',
  'ride for the north road',
  'fight the rider who blocks the bridge',
  'cross the bridge',
  'climb down the bank to the river',
  'hide under the bridge until the riders pass',
  'persuade the ferryman to take you across',
  'count the coins in the purse',
];

test('dice outcomes on a real model', async ({ page }) => {
  test.setTimeout(60 * 60_000);
  const turns: { outcome: string | undefined; action: string | undefined; output: string }[] = [];
  page.on('requestfinished', async (r) => {
    if (!r.url().endsWith('/completion')) return;
    const body = r.postDataJSON() as { prompt: string; grammar?: string; n_predict: number; id_slot?: number };
    if (body.grammar || body.n_predict === 0 || body.id_slot === 1) return;
    const text = (await (await r.response())?.text()) ?? '';
    const output = text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => (JSON.parse(l.slice(6)) as { content?: string }).content ?? '')
      .join('');
    const lines = body.prompt.split('\n');
    turns.push({ outcome: lines.find((l) => l.startsWith('[Outcome:')), action: lines.findLast((l) => l.startsWith('> ')), output });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Consequences (dice)' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  for (const attempt of ATTEMPTS) {
    await page.getByRole('textbox', { name: 'Take a turn' }).fill(attempt);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 180_000 });
  }
  console.log(writeMeasurement(process.env['MEASURE_LABEL'] ?? 'dice-m21-5', { turns }));
});
