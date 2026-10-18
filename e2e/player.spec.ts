import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('"This is me" folds a card into You: its line is a proposal until kept', async ({ page }) => {
  const fact = { id: 'f9', text: 'Sells salt.', fromAction: 1, source: 'memory' as const, sourceId: 'action:1', evidence: 'bends 1' };
  await openSeededAdventure(page, 3, undefined, { entities: [{ id: 'ent_rowan', name: 'Rowan', facts: [fact] }] });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Rowan' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('dialog', { name: 'Rowan' }).getByRole('button', { name: 'This is me' }).click();

  await expect(page.getByRole('button', { name: 'Open Rowan' })).toHaveCount(0);
  const you = page.getByRole('region', { name: 'You' });
  await expect(you.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Rowan');
  await expect(you.getByText('Proposed')).toBeVisible();
  await you.getByRole('button', { name: 'Keep' }).click();
  await expect(you.getByText('Proposed')).toHaveCount(0);
  await expect(you.getByRole('listitem').filter({ hasText: 'Sells salt.' })).toBeVisible();
});
