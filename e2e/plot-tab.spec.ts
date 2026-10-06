import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('there is no Scene section before the memory jobs write a scene', async ({ page }) => {
  await openSeededAdventure(page, 3);
  await expect(page.getByText('Story Summary', { exact: true })).toBeVisible();
  await expect(page.getByText('Scene', { exact: true })).toHaveCount(0);
});

test('a seeded scene shows in the Plot tab and an edit persists', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'the Old Well', present: ['Merav'], time: { day: 2, part: 'evening' } } });
  await page.getByText('Scene', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('the Old Well');
  await expect(page.getByRole('textbox', { name: 'Present' })).toHaveValue('Merav');
  await expect(page.getByLabel('Time of day')).toHaveValue('evening');
  await page.getByLabel('Time of day').selectOption('night');
  await page.getByRole('textbox', { name: 'Weather' }).fill('dust storm');

  await page.reload();
  await page.getByText('Scene', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Weather' })).toHaveValue('dust storm');
  await expect(page.getByLabel('Time of day')).toHaveValue('night');
  await expect(page.getByRole('spinbutton', { name: 'Day' })).toHaveValue('2');

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('drink from the well');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context.getByText('[Scene: the Old Well · Present: Merav · Night, day 2 · Dust storm]')).toBeVisible();
});

test('an edited Story Summary persists and shows when it refreshes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  const summary = page.getByRole('textbox', { name: 'Story Summary' });
  await page.getByText('Story Summary', { exact: true }).click();
  await summary.fill('Mira owes the ferryman a silver coin.');
  await expect(page.getByText(/Next refresh in \d+ actions\. Your edits are kept as the base for the next summary\./)).toBeVisible();

  // Reloading straight away is the regression: the edit is still inside the save debounce.
  await page.reload();
  await page.getByText('Story Summary', { exact: true }).click();
  await expect(summary).toHaveValue('Mira owes the ferryman a silver coin.');
});
