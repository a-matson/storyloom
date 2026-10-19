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

test('every image and model setting has help, and clip skip 1 warns', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Model settings', { exact: true }).click();
  await page.getByText('Images', { exact: true }).click();

  const inputs = page.getByRole('spinbutton');
  const count = await inputs.count();
  expect(count).toBeGreaterThan(15);
  for (let i = 0; i < count; i++) {
    const ids = (await inputs.nth(i).getAttribute('aria-describedby')) ?? '';
    const helpId = ids.split(' ').find((id) => id.endsWith('-help'));
    expect(helpId, (await inputs.nth(i).getAttribute('id')) ?? '').toBeDefined();
    await expect(page.locator(`[role="tooltip"][id="${helpId}"]`)).not.toBeEmpty();
  }

  // Keyboard: focus shows the tooltip, Escape hides it.
  const about = page.locator('button[aria-describedby="img-clipSkip-help"]');
  await about.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#img-clipSkip-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#img-clipSkip-help')).toBeHidden();

  const clip = page.getByRole('spinbutton', { name: 'Clip skip' });
  await clip.fill('1');
  await expect(page.getByRole('note').filter({ hasText: 'Blank white' })).toBeVisible();
  await expect(clip).toHaveAttribute('aria-describedby', /img-clipSkip-warn/);
  await clip.fill('2');
  await expect(page.getByRole('note').filter({ hasText: 'Blank white' })).toHaveCount(0);
});

test('a memory preset sets its fields, survives a reload, and an edit shows Custom', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();

  const preset = page.getByRole('combobox', { name: 'Memory preset' });
  const bank = page.getByRole('spinbutton', { name: 'Bank size' });
  await expect(preset).toHaveValue('');
  await preset.selectOption({ label: 'Adventure' });
  await expect(page.getByRole('combobox', { name: 'State read' })).toHaveValue('idle');
  await preset.selectOption({ label: 'Slice of life' });
  await expect(bank).toHaveValue('400');
  await expect(page.getByRole('combobox', { name: 'State read' })).toHaveValue('every');

  await page.reload();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await expect(preset).toHaveValue('sliceOfLife');
  await bank.fill('300');
  await bank.blur();
  await expect(preset).toHaveValue('');
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
