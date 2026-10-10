import { expect, test } from '@playwright/test';

const portraitsOffStored = async () => {
  const req = indexedDB.open('storyloom');
  const db = await new Promise<IDBDatabase>((ok, fail) => {
    req.addEventListener('success', () => ok(req.result));
    req.addEventListener('error', () => fail(req.error));
  });
  const settings = await new Promise<{ speakerAvatars?: boolean } | undefined>((ok, fail) => {
    const r = db.transaction('settings').objectStore('settings').get('app');
    r.addEventListener('success', () => ok(r.result as { speakerAvatars?: boolean } | undefined));
    r.addEventListener('error', () => fail(r.error));
  });
  db.close();
  return settings?.speakerAvatars === false;
};

test('settings are stored as they are typed and survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('#server-url').fill('http://localhost:9100');
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  await page.getByRole('switch', { name: 'Use a utility model' }).click();
  await page.getByRole('textbox', { name: 'Utility server URL' }).fill('http://localhost:9101');
  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill('http://localhost:9102');
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('slate');
  await page.getByRole('switch', { name: 'Character portraits beside the story' }).click();
  // The write lands a moment after the click; a reload before it would test the race, not the feature.
  await expect.poll(() => page.evaluate(portraitsOffStored)).toBe(true);

  await page.reload();
  await expect(page.locator('#server-url')).toHaveValue('http://localhost:9100');
  await expect(page.getByRole('textbox', { name: 'Utility server URL' })).toHaveValue('http://localhost:9101');
  await expect(page.getByRole('textbox', { name: 'Image server URL' })).toHaveValue('http://localhost:9102');
  await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue('slate');
  await expect(page.getByRole('switch', { name: 'Character portraits beside the story' })).not.toBeChecked();
});

test('a first run interrupted by a reload resumes on setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill('http://localhost:9100');
  await page.reload();
  await expect(page).toHaveURL(/#\/setup$/);
  await expect(page.locator('#server-url')).toHaveValue('http://localhost:9100');
});
