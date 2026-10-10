import { expect, test } from '@playwright/test';

test('an image preset is saved for every adventure, applied and deleted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();

  const steps = page.getByRole('spinbutton', { name: 'Steps', exact: true });
  await steps.fill('33');
  await steps.blur();
  await page.getByRole('button', { name: 'Save as preset' }).click();
  // Escape backs out without saving.
  await page.getByRole('textbox', { name: 'Preset name' }).press('Escape');
  await expect(page.getByRole('textbox', { name: 'Preset name' })).toBeHidden();
  await page.getByRole('button', { name: 'Save as preset' }).click();
  await page.getByRole('textbox', { name: 'Preset name' }).fill('My checkpoint');
  await page.getByRole('textbox', { name: 'Preset name' }).press('Enter');
  const preset = page.getByRole('combobox', { name: 'Apply preset' }).last();
  await expect(preset.locator('optgroup[label="Saved"] option')).toHaveText(['My checkpoint']);

  // App-wide and stored: after a reload, a built-in preset, then mine brings 33 back.
  await page.reload();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();
  await preset.selectOption({ label: 'Fast' });
  await expect(steps).toHaveValue('14');
  await preset.selectOption({ label: 'My checkpoint' });
  await expect(steps).toHaveValue('33');

  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(page.getByText('Delete “My checkpoint”?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(preset.locator('optgroup')).toHaveCount(0);
});

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

  // Clip skip may be blank (server default), never 0.
  const clip = page.getByRole('spinbutton', { name: 'Clip skip' });
  await clip.fill('0');
  await clip.blur();
  await expect(clip).toHaveValue('1');

  await page.getByRole('switch', { name: 'Hires pass' }).click();
  const denoise = page.getByRole('spinbutton', { name: 'Denoise' });
  await expect(denoise).toHaveValue('0.55');
  await denoise.fill('');
  await denoise.blur();
  await expect(denoise).toHaveValue('0.55');
  await denoise.fill('0');
  await denoise.blur();
  await expect(denoise).toHaveValue('0.05');

  // The settings survive a reload, so nothing invalid was persisted.
  await page.reload();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('256');
});
