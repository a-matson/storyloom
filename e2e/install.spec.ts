import { expect, test } from '@playwright/test';

// Chrome's BeforeInstallPromptEvent, faked: a plain Event carrying a prompt() stub that marks the window.
const offerInstall = () =>
  window.dispatchEvent(
    Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => Object.assign(window, { __prompted: true }),
    }),
  );

test('Install shows only while the browser offers it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My adventures' })).toBeVisible();
  const install = page.getByRole('button', { name: 'Install' });
  await expect(install).toHaveCount(0);

  await page.evaluate(offerInstall);
  await install.click();
  await expect.poll(() => page.evaluate(() => '__prompted' in window)).toBe(true);
  await expect(install).toHaveCount(0);

  await page.evaluate(offerInstall);
  await expect(install).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(install).toHaveCount(0);
});
