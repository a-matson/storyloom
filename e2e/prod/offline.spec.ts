import { expect, test } from '@playwright/test';

// Runs against a production build (`playwright.prod.config.ts`): dev never registers the service worker.
test('the installed shell opens offline and leaves the API alone', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My adventures' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // In the single-origin build this origin is llama-server's: its API must reach the network.
  const health = page.waitForResponse('**/health');
  await page.evaluate(() => fetch('/health').then(() => undefined));
  expect((await health).fromServiceWorker()).toBe(false);

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My adventures' })).toBeVisible();
});
