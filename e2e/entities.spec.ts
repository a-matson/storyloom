import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('the Characters tab edits, pins and promotes an entity', async ({ page }) => {
  // Long enough that the first actions are scrolled out of view.
  await openSeededAdventure(page, 40);

  await page.getByRole('button', { name: 'World · 1' }).click();
  await expect(page.getByRole('button', { name: 'Open Old Well' })).toBeVisible();
  await page.getByRole('button', { name: 'Characters · 1' }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  const drawer = page.getByRole('dialog', { name: 'Merav' });
  await expect(drawer).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(violations).toEqual([]);

  await drawer.getByRole('textbox', { name: 'location' }).fill('the gate');
  await drawer.getByRole('button', { name: 'Pin: She keeps the needle map.' }).click();
  await expect(drawer.getByRole('button', { name: 'Pin: She keeps the needle map.' })).toHaveAttribute('aria-pressed', 'true');
  await drawer.getByRole('button', { name: 'Promote to story card' }).click();
  await expect(drawer.getByRole('button', { name: 'Is a story card' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByText('location: the gate')).toBeVisible();

  await page.getByRole('button', { name: 'Story cards · 1' }).click();
  await expect(page.getByRole('button', { name: 'Edit story card Merav' })).toBeVisible();

  // A fact's action label scrolls the story there.
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await expect(page.getByText('The road bends 2.')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Show action 2 in the story' }).click();
  await expect(page.getByText('The road bends 2.')).toBeInViewport();
});
