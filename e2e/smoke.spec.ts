import { AxeBuilder } from '@axe-core/playwright';
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

test('import an AI Dungeon adventure from the library', async ({ page }) => {
  await connectDemo(page);
  const aid = { title: 'Salt Road', actions: [{ text: 'You are on the Salt Road.' }, { text: '> You look around.', type: 'do' }] };
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import…' }).click();
  await (await chooser).setFiles({ name: 'salt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(aid)) });
  await expect(page.getByRole('button', { name: 'Salt Road', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue Salt Road 2 actions' })).toBeVisible();
});

test('the library updates live when another tab starts an adventure', async ({ page, context }) => {
  await connectDemo(page);
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: 'Start your first adventure' })).toBeVisible();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(other.getByRole('button', { name: 'Open Fantasy' })).toBeVisible();
});

test('drawers are modal: focus stays inside and Escape closes them', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Context sent to the model' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the output tools appear on hover and on keyboard focus', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await takeTurn(page, 'open the letter');
  const story = page.getByText('hand stops moving.');
  await expect(story).toBeVisible();
  // toBeVisible ignores opacity, so the reveal is asserted on the computed value.
  const tools = page.getByRole('button', { name: 'Erase to here' }).locator('..');
  await expect(tools).toHaveCSS('opacity', '0');
  await story.hover();
  await expect(tools).toHaveCSS('opacity', '1');

  await page.mouse.move(0, 0);
  await expect(tools).toHaveCSS('opacity', '0');
  await page.getByRole('button', { name: 'Erase to here' }).focus();
  await expect(tools).toHaveCSS('opacity', '1');
});

test('player and AI text share one left edge', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await takeTurn(page, 'open the letter');
  const player = await page.getByText('You open the letter.').boundingBox();
  const ai = await page.getByText('hand stops moving.').boundingBox();
  expect(Math.abs((player?.x ?? 0) - (ai?.x ?? -1))).toBeLessThanOrEqual(1);
});

test('the trace viewer shows the latest generation and its prompt', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await takeTurn(page, 'open the letter');
  await expect(page.getByText('hand stops moving.')).toBeVisible();
  await page.getByRole('button', { name: 'Trace' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Turn trace' });
  await expect(dialog.getByText('done', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Prompt' }).click();
  await expect(dialog.getByText('open the letter')).toBeVisible();
});
