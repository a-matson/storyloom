import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const hasModel = existsSync('public/models/bge-small-en-v1.5/onnx/model_quantized.onnx');

/** Records every request; anything not on the origin breaks the local-only rule. */
function watchRequests(page: Page, origin: string): { all: string[]; foreign: string[] } {
  const seen = { all: [] as string[], foreign: [] as string[] };
  page.on('request', (r) => {
    const url = r.url();
    seen.all.push(url);
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) seen.foreign.push(url);
  });
  return seen;
}

async function startDemoAdventure(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
}

async function takeTurn(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('open the letter');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('You open the letter.')).toBeVisible();
}

test('with no model, the embedding worker stays on the origin and falls back to hashing', async ({ page, baseURL }) => {
  test.skip(hasModel, 'a local model is present');
  const seen = watchRequests(page, baseURL ?? '');
  const fellBack = page.waitForEvent('console', (m) => m.text().includes('no local embedding model'));
  await startDemoAdventure(page);
  await fellBack;
  await takeTurn(page);
  expect(seen.all.some((u) => u.includes('/models/'))).toBe(true); // the worker's requests are observed
  expect(seen.foreign).toEqual([]);
});

test('with a model in public/models, it loads from the origin only', async ({ page, baseURL }) => {
  test.skip(!hasModel, 'no local model');
  const seen = watchRequests(page, baseURL ?? '');
  const fallbacks: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('no local embedding model')) fallbacks.push(m.text());
  });
  const wasm = page.waitForResponse((r) => r.url().endsWith('.wasm') && r.ok());
  await startDemoAdventure(page);
  await wasm;
  await takeTurn(page);
  expect(fallbacks).toEqual([]);
  expect(seen.foreign).toEqual([]);
});
