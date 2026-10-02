import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Run with `pnpm measure:renders`: a production build with the Profiler compiled in.
test.skip(process.env['MEASURE_RENDERS'] !== '1', 'measurement run only');

test('render cost of one played turn', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill('http://localhost:8089');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page.getByText(/actions/).first()).toBeVisible();
  const read = () => page.evaluate(() => ({ ...(window as unknown as { __renders: { commits: number; ms: number } }).__renders }));
  const before = await read();
  for (const text of ['open the letter', 'read it aloud', 'look around']) {
    await page.getByRole('textbox', { name: 'Take a turn' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/% cached/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  }
  const after = await read();
  const result = {
    label: process.env['MEASURE_LABEL'] ?? 'run',
    turns: 3,
    commits: after.commits - before.commits,
    renderMs: +(after.ms - before.ms).toFixed(1),
  };
  console.log(JSON.stringify(result));
  mkdirSync('bench/results', { recursive: true });
  writeFileSync(`bench/results/renders-${result.label}.json`, JSON.stringify(result, null, 2));
});
