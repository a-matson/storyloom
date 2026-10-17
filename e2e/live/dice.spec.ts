import { expect, test } from '@playwright/test';
import { z } from 'zod/mini';
import * as S from '@core/schema';
import { writeMeasurement } from '../../bench/env';
import { readDb } from '../../bench/livePlay';

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
  // The trace keeps the script's `d20 <roll> vs <dc>` log and the reply it led to; the action before the reply is the Do.
  // The last reply is saved after its Send button returns.
  await expect.poll(async () => (await readDb(page)).traces.length).toBeGreaterThanOrEqual(ATTEMPTS.length);
  const db = await readDb(page);
  const actions = z.array(S.Action).parse(db.actions);
  const traces = z
    .array(S.TurnTrace)
    .parse(db.traces)
    .toSorted((a, b) => a.createdAt - b.createdAt);
  const turns = traces.map(({ actionId, scriptLogs }) => {
    const at = actions.findIndex((a) => a.id === actionId);
    const text = (i: number) => {
      const a = actions[i];
      return a ? (a.versions[a.active] ?? '') : '';
    };
    return { roll: scriptLogs.find((l) => l.includes('d20')), action: text(at - 1), output: text(at) };
  });
  console.log(writeMeasurement(process.env['MEASURE_LABEL'] ?? 'dice-m21-5', { turns }));
});
