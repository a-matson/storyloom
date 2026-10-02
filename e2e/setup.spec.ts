import { expect, test } from '@playwright/test';

const UTILITY = 'http://localhost:9999';

test('a utility model gets the memory jobs and survives a reload', async ({ page }) => {
  const prompts: string[] = [];
  await page.route(`${UTILITY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    prompts.push((route.request().postDataJSON() as { prompt: string }).prompt);
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"content":"The traveller walked the Salt Road.","stop":true}\n\n' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Use a utility model' }).click();
  await page.getByRole('textbox', { name: 'Utility server URL' }).fill(`${UTILITY}/`);
  await page.getByRole('combobox', { name: 'Utility template' }).selectOption('llama3');
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('qwen-3b.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  const actions = [{ text: 'You are on the Salt Road.' }, ...Array.from({ length: 15 }, (_, i) => ({ text: `> You walk on, step ${i}.`, type: 'do' }))];
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import…' }).click();
  await (await chooser).setFiles({ name: 'salt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ title: 'Salt Road', actions })) });
  await page.getByRole('button', { name: /^Continue Salt Road/ }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('summaries: utility model')).toBeAttached();
  await expect.poll(() => prompts.length).toBeGreaterThan(0);
  expect(prompts[0]).toContain('<|start_header_id|>');

  await page.goto('/#/settings');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Use a utility model' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Utility server URL' })).toHaveValue(UTILITY);
  await expect(page.getByRole('combobox', { name: 'Utility template' })).toHaveValue('llama3');
});
