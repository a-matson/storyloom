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
