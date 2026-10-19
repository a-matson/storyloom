import { expect, test, type Page } from '@playwright/test';
import { openSeededAdventure } from './seed';

async function rawPrompt(page: Page) {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  return context;
}

/** Selects `text` inside the story's action `n`, as a mouse drag would. */
async function select(page: Page, n: number, text: string) {
  await page.locator('#story [data-action-id]').nth(n).getByText(text).waitFor();
  await page.evaluate(
    ({ i, words }) => {
      const block = document.querySelectorAll('#story [data-action-id]')[i];
      const walker = document.createTreeWalker(block ?? document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf(words) ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + words.length);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        return;
      }
      throw new Error(`no "${words}" in action ${i}`);
    },
    { i: n, words: text },
  );
  return page.getByRole('toolbar', { name: 'Pin selection' });
}

test('selected story text pins as a rule, a fact about a character, or an item', async ({ page }) => {
  await openSeededAdventure(page, 3);

  await (await select(page, 1, 'The road bends 1.')).getByRole('button', { name: 'Pin as rule' }).click();
  await expect(page.getByText('Rule added, always sent')).toBeVisible();
  await page.getByRole('button', { name: 'Rules · 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Rule text' })).toHaveValue('The road bends 1.');
  const context = await rawPrompt(page);
  await expect(context.getByText('[Rules: The road bends 1]')).toBeVisible();
  await page.keyboard.press('Escape');

  await (await select(page, 2, 'road bends')).getByRole('combobox', { name: 'Pin as fact about' }).selectOption('Merav');
  await expect(page.getByText('Pinned to Merav')).toBeVisible();

  await (await select(page, 0, 'road')).getByRole('button', { name: 'Make item' }).click();
  await expect(page.getByText('road added as an item')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Pin selection' })).toHaveCount(0);
});

test('/rule adds a rule; a gate on an absent place takes it out of the prompt', async ({ page }) => {
  await openSeededAdventure(page, 3);
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  await input.fill('/rule The salt road is cursed.');
  await input.press('Enter');
  await expect(page.getByText('Rule added, always sent')).toBeVisible();

  await page.getByRole('button', { name: 'Rules · 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Rule text' })).toHaveValue('The salt road is cursed.');
  let context = await rawPrompt(page);
  await expect(context.getByText('[Rules: The salt road is cursed]')).toBeVisible();
  await page.keyboard.press('Escape');

  // The demo reply names Merav, so she would be in play; nothing names the well.
  await page.getByRole('combobox', { name: 'Add gate' }).selectOption('Old Well');
  await expect(page.getByRole('button', { name: 'Remove gate Old Well' })).toBeVisible();
  context = await rawPrompt(page);
  await expect(context.getByText('[Rules:')).toHaveCount(0);
});

test('find rules in the last passage proposes a rule the player confirms', async ({ page }) => {
  const UTILITY = 'http://localhost:9997';
  await page.route(`${UTILITY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    const content = prompt.includes('standing rules') ? JSON.stringify({ rules: [{ text: 'Kobolds fear fire.', about: [] }] }) : 'The road bends.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, { utility: `${UTILITY}/` });

  await page.getByRole('button', { name: 'Rules · 0' }).click();
  await page.getByRole('button', { name: 'Find rules in the last passage' }).click();
  await expect(page.getByText('Found 1 rule: confirm them in Rules')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rule text' })).toHaveValue('Kobolds fear fire.');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
});
