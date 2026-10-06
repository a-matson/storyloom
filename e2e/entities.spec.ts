import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

// 1x1 PNG that `createImageBitmap` decodes (the re-encode needs one).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IWcDAALUASNyYth2AAAAAElFTkSuQmCC';

test('the Characters tab edits, pins and promotes an entity', async ({ page }) => {
  // Long enough that the first actions are scrolled out of view.
  await openSeededAdventure(page, 40);

  await page.getByRole('button', { name: 'World · 1' }).click();
  await expect(page.getByRole('button', { name: 'Open Old Well' })).toBeVisible();
  await page.getByRole('button', { name: 'Characters · 1' }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  const drawer = page.getByRole('dialog', { name: 'Merav' });
  await expect(drawer).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(violations).toEqual([]);

  await drawer.getByRole('textbox', { name: 'location' }).fill('the gate');
  await drawer.getByRole('button', { name: 'Pin: She keeps the needle map.' }).click();
  await expect(drawer.getByRole('button', { name: 'Pin: She keeps the needle map.' })).toHaveAttribute('aria-pressed', 'true');
  await drawer.getByRole('button', { name: 'Promote to story card' }).click();
  await expect(drawer.getByRole('button', { name: 'Is a story card' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByText('location: the gate')).toBeVisible();

  await page.getByRole('button', { name: 'Story cards · 1' }).click();
  await expect(page.getByRole('button', { name: 'Edit story card Merav' })).toBeVisible();

  // A fact's action label scrolls the story there.
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await expect(page.getByText('The road bends 2.')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Show action 2 in the story' }).click();
  await expect(page.getByText('The road bends 2.')).toBeInViewport();
});

test('a portrait is drawn on the image server and replaces the initials', async ({ page }) => {
  const images = 'http://localhost:7999';
  const prompts: string[] = [];
  await page.route(`${images}/**`, async (route) => {
    if (new URL(route.request().url()).pathname !== '/sdapi/v1/txt2img') return route.fulfill({ json: [] });
    prompts.push((route.request().postDataJSON() as { prompt: string }).prompt);
    return route.fulfill({ json: { images: [PNG] } });
  });
  await openSeededAdventure(page, 3, `${images}/`);

  await page.getByRole('button', { name: 'Characters · 1' }).click();
  const card = page.getByRole('button', { name: 'Open Merav' });
  await expect(card.locator('img')).toHaveCount(0);
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Merav' });
  await drawer.getByRole('button', { name: 'Draw' }).click();
  await expect(drawer.getByRole('button', { name: 'Redraw' })).toBeEnabled();
  expect(prompts).toEqual([expect.stringMatching(/^portrait, head and shoulders, A well-warden/)]);
  await page.keyboard.press('Escape');
  await expect(card.locator('img')).toHaveAttribute('src', /^blob:/);
});
