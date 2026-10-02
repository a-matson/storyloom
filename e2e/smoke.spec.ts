import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function connectDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Start your first adventure' })).toBeVisible();
}

async function takeTurn(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

// Serious/critical violations fail; the rest are tracked as a baseline until the UI pass (P5).
async function expectNoSeriousA11yIssues(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`);
  expect(serious).toEqual([]);
}

test('play, retry, undo and reload with the demo backend', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  await takeTurn(page, 'open the letter');
  await expect(page.getByText('You open the letter.')).toBeVisible();
  await expect(page.getByText('hand stops moving.')).toBeVisible();
  await expect(page.getByText(/% cached/)).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('a camel coughs and is quiet again.')).toBeVisible();
  await expect(page.getByText('hand stops moving.')).toBeHidden();

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.getByText('hand stops moving.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('You open the letter.')).toBeVisible();
  await expect(page.getByText('hand stops moving.')).toBeVisible();
});

test('accessibility: setup, library and game', async ({ page }) => {
  await page.goto('/');
  await expectNoSeriousA11yIssues(page);
  await connectDemo(page);
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await takeTurn(page, 'look around');
  await expect(page.getByText(/% cached/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});
