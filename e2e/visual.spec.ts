import { expect, test, type Page } from '@playwright/test';
import { openSeededAdventure } from './seed';

// Pixel baselines of the artboard states; they guard the Tailwind/Base UI migration (P5).
// Linux only: run `pnpm e2e:update-screenshots` (Docker) to regenerate.
test.skip(process.platform !== 'linux', 'screenshot baselines are rendered on Linux');

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('open the letter');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/% cached/)).toBeVisible();
}

const shot = (page: Page, name: string) => expect(page).toHaveScreenshot(`${name}.png`, { mask: [page.getByText(/\d s ·|% cached/)], fullPage: true });

test('setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await shot(page, 'setup');
});

test('library', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('heading', { name: 'My adventures' })).toBeVisible();
  await shot(page, 'library');
});

test('library with the custom opening open, narrow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Write your own opening' }).click();
  await expect(page.getByRole('textbox', { name: 'Your opening' })).toBeVisible();
  await shot(page, 'library-custom-mobile');
});

test('game with adventure sidebar', async ({ page }) => {
  await startGame(page);
  await shot(page, 'game-adventure');
});

test('game with gameplay tab', async ({ page }) => {
  await startGame(page);
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await shot(page, 'game-gameplay');
});

test('story cards and card dialog', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: /^Story cards/ }).click();
  await shot(page, 'story-cards');
  await page.getByRole('button', { name: '+ New' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'card-dialog');
});

test('game with characters tab', async ({ page }) => {
  await openSeededAdventure(page, 4);
  await page.getByRole('button', { name: /^Characters/ }).click();
  await expect(page.getByRole('button', { name: 'Open Merav' })).toBeVisible();
  await shot(page, 'game-characters');
});

test('context viewer', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: 'View context' }).last().click();
  await expect(page.getByRole('dialog', { name: 'Context sent to the model' })).toBeVisible();
  await shot(page, 'context-viewer');
});
