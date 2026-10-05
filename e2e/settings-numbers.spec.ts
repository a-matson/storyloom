import { expect, test } from '@playwright/test';

// Departure 5: clearing or zeroing a number field used to write 0 straight into the settings.
test('a number setting cannot be left at 0', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();

  const width = page.getByRole('spinbutton', { name: 'Width' });
  await expect(width).toHaveValue('512');
  // Clearing the field leaves the draft empty, and the blur puts the stored value back.
  await width.fill('');
  await width.blur();
  await expect(width).toHaveValue('512');
  // Below the minimum is clamped, not written through.
  await width.fill('0');
  await width.blur();
  await expect(width).toHaveValue('256');

  const cfg = page.getByRole('spinbutton', { name: 'CFG scale' });
  await cfg.fill('0');
  await cfg.blur();
  await expect(cfg).toHaveValue('1');

  // The settings survive a reload, so nothing invalid was persisted.
  await page.reload();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('256');
});
