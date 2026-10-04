import { expect, test } from '@playwright/test';

test('an edited Story Summary persists and shows when it refreshes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  const summary = page.getByRole('textbox', { name: 'Story Summary' });
  await page.getByText('Story Summary', { exact: true }).click();
  await summary.fill('Mira owes the ferryman a silver coin.');
  await expect(page.getByText(/Next refresh in \d+ actions\. Your edits are kept as the base for the next summary\./)).toBeVisible();

  // Reloading straight away is the regression: the edit is still inside the save debounce.
  await page.reload();
  await page.getByText('Story Summary', { exact: true }).click();
  await expect(summary).toHaveValue('Mira owes the ferryman a silver coin.');
});
