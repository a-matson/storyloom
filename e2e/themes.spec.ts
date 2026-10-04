import { expect, test, type Page } from '@playwright/test';

// 1x1 PNG; the upload path decodes it through a canvas, so an invalid one would fail the test.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IWcDAALUASNyYth2AAAAAElFTkSuQmCC';

const theme = (page: Page) => page.locator('html').getAttribute('data-theme');

test('a styled theme persists across a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('slate');
  // The setup screen applies a theme when the settings are saved, not on the change.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => theme(page)).toBe('slate');

  await page.reload();
  await expect.poll(() => theme(page)).toBe('slate');
});

test('Dynamic recolours the accent from the cover', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dynamic');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  // No cover yet: the dark tokens stand, nothing is set inline.
  await expect(page.locator('html')).not.toHaveAttribute('style', /--lantern/);

  await page.getByRole('button', { name: 'Details' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload…' }).click()]);
  await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });

  // The cover's accent lands inline, with saturation and lightness inside the readable band.
  await expect(page.locator('html')).toHaveAttribute('style', /--lantern: hsl\(\d+ (4[5-9]|[5-8]\d)% (5[5-9]|6[0-8])%\)/);
});
