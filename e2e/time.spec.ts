import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('/time and /travel set the scene without an action; the next prompt carries the time', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'Old Well', present: ['Merav'] } });
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  const actions = page.locator('#story [data-action-id]');
  await expect(actions).toHaveCount(3);

  await input.fill('/time evening, day 2');
  await input.press('Enter');
  await expect(page.getByText('Now Day 2, evening')).toBeVisible();
  await input.fill('/travel The Docks');
  await input.press('Enter');
  await expect(page.getByText('Travelled to The Docks')).toBeVisible();
  await input.fill('/wait soon');
  await input.press('Enter');
  await expect(page.getByText('Could not read "soon": try /wait 3 hours')).toBeVisible();
  await expect(actions).toHaveCount(3);

  await page.getByRole('button', { name: /^World/ }).click();
  await expect(page.getByRole('combobox', { name: 'Time of day' })).toHaveValue('evening');
  await expect(page.getByRole('spinbutton', { name: 'Day' })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('The Docks');

  await input.fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context).toContainText('[Scene: The Docks · Day 2, evening · Present: Merav');
});
