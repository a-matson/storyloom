import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('before turn 1 the canon editor adds a character and locks its species', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  const hint = page.getByText('Set who is who before you play');
  await hint.getByRole('button', { name: 'Canon' }).click();
  const drawer = page.getByRole('dialog', { name: 'Canon' });
  await drawer.getByRole('textbox', { name: 'Add a character' }).fill('Mira');
  await drawer.getByRole('textbox', { name: 'Add a character' }).press('Enter');
  const mira = drawer.getByRole('region', { name: 'Mira' });
  await mira.getByRole('textbox', { name: 'species' }).fill('kobold');
  await mira.getByRole('switch', { name: 'Lock species' }).click();
  await expect(mira.getByText('Canon', { exact: true })).toBeVisible();
  await expect(mira.getByRole('textbox', { name: 'species' })).toHaveValue('kobold');
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await drawer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Mira' }).click();
  await expect(page.getByRole('button', { name: 'Lock species as canon' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('dialog', { name: 'Mira' }).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(hint).toHaveCount(0);
});
