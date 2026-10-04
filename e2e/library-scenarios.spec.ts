import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function connectDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('the scenario grid plays, edits and deletes a scenario', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You are ${character.name}, on the night ferry.');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Night Ferry');
  await page.getByRole('textbox', { name: 'Tags' }).fill('mystery, sea');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  await expect(page.getByText('Story · 1 placeholder · 0 cards')).toBeVisible();
  await expect(page.getByText('sea', { exact: true })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.getByRole('button', { name: 'Night Ferry', exact: true }).click();
  await expect(page).toHaveURL(/#\/scenario\//);
  await page.getByRole('button', { name: 'Back to library' }).click();

  await page.getByRole('button', { name: 'Play Night Ferry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Night Ferry' });
  await dialog.getByRole('textbox', { name: "Enter your character's name…" }).fill('Merav');
  await dialog.getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText('You are Merav, on the night ferry.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete Night Ferry' }).click();
  await expect(page.getByRole('button', { name: 'Play Night Ferry' })).toHaveCount(0);
  // The adventure outlives its scenario.
  await expect(page.getByRole('button', { name: 'Open Night Ferry' })).toBeVisible();
});

// 1x1 PNG; the upload path re-encodes it through a canvas, so an invalid one would fail the test.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IWcDAALUASNyYth2AAAAAElFTkSuQmCC';

test('an uploaded cover survives a reload and shows on the library card', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Covered');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload…' }).click()]);
  await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await expect(page.locator('div[style*="blob:"]')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();

  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Covered', exact: true })).toBeVisible();
  await expect(page.locator('div[style*="blob:"]')).toBeVisible();
});

test('"Surprise me" opens an adventure written by the model', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText(/Merav|Wind pushes salt|pinpricks|"Don't,"/).first()).toBeVisible();
});
