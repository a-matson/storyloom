import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('a role the story calls a character by shows as a chip, and ✕ removes it', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { entities: [{ id: 'ent_weever', name: 'Weever', description: 'A kobold.', roles: ['the kobold'] }] });
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Weever' }).click();
  const roles = page.getByRole('dialog', { name: 'Weever' }).getByLabel('Roles');
  await expect(roles).toContainText('the kobold');
  await roles.getByRole('button', { name: 'Remove role the kobold' }).click();
  await expect(roles).toHaveCount(0);
});
