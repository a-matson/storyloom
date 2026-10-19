import { expect, test } from '@playwright/test';
import { openSeededAdventure, select } from './seed';

test('Branch from here opens a copy cut at that action; the original is untouched', async ({ page }) => {
  await openSeededAdventure(page, 5);
  await (await select(page, 2, 'The road bends 2.')).getByRole('button', { name: 'Branch from here' }).click();

  await expect(page.getByText('Salt Road — branch')).toBeVisible();
  await expect(page.locator('#story [data-action-id]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('button', { name: 'Open Salt Road', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Salt Road', exact: true }).click();
  await expect(page.locator('#story [data-action-id]')).toHaveCount(5);
});
