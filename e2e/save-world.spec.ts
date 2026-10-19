import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('an adventure saves its world as a scenario in the Library (M24-3)', async ({ page }) => {
  await openSeededAdventure(page, 2);
  await page.getByRole('button', { name: 'Details' }).click();
  const saved = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Save as scenario' }).click();
  const dialog = await saved;
  expect(dialog.message()).toBe('Saved "Salt Road" to the Library.');
  await dialog.accept();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('button', { name: 'Play Salt Road' })).toBeVisible();
});
