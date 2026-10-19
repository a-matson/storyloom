import { expect, test, type Page } from '@playwright/test';
import { openSeededAdventure, select } from './seed';

async function rawPrompt(page: Page) {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  return context;
}

test('selected story text pins as a rule, a fact, an item, an alias or a secret', async ({ page }) => {
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

  await (await select(page, 0, 'bends')).getByRole('combobox', { name: 'This is' }).selectOption('Merav');
  await expect(page.getByText('bends is now Merav')).toBeVisible();
  // A name already taken is not offered as an alias again.
  await expect((await select(page, 0, 'bends')).getByRole('combobox', { name: 'This is' })).toHaveCount(0);

  await (await select(page, 2, 'road bends')).getByRole('button', { name: 'Mark secret' }).click();
  await expect(page.getByText('Secret saved: who knows it is in World › Secrets')).toBeVisible();
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

test('a selection checked against the record lists the line it breaks; the drawer adds an alias', async ({ page }) => {
  const UTILITY = 'http://localhost:9997';
  await page.route(`${UTILITY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    // The check breaks the first record line it is sent.
    const fact = /Established facts:\n- (.+)/.exec(prompt)?.[1];
    const content = fact ? JSON.stringify({ contradicts: true, fact }) : 'The road bends.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, { opening: 'Merav burns the needle map.', utility: `${UTILITY}/` });

  await (await select(page, 0, 'Merav burns')).getByRole('button', { name: 'Check against the record' }).click();
  const finding = page.getByRole('list', { name: 'Continuity check' }).getByRole('button');
  await expect(finding).toHaveCount(1);
  await expect(finding).toContainText(/— action \d+/);
  await finding.click();
  await expect(page.locator('#story [data-action-id]').first()).toBeInViewport();

  await page.getByRole('button', { name: /^Characters/ }).click();
  const open = page.getByRole('complementary').getByRole('button', { name: 'Open Merav' });
  await open.click();
  const aliases = page.getByRole('dialog', { name: 'Merav' }).getByRole('textbox', { name: 'Also called (comma-separated)' });
  await aliases.fill('the well-warden, Salt Mother');
  await aliases.blur();
  await page.keyboard.press('Escape');
  await open.click();
  await expect(aliases).toHaveValue('the well-warden, Salt Mother');
});
