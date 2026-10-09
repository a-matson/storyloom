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

const OPENING = 'The well is dry.\n\n"Hold the lamp," Merav says.';

test("dialogue gets the speaker's portrait after a turn", async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: OPENING });
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait');
  await page.getByRole('button', { name: 'Send' }).click();
  const story = page.locator('#story');
  // The guess labels the second paragraph only: the first has no dialogue.
  await expect(story.getByText('Merav says', { exact: true })).toHaveCount(1);
  await expect(story.locator('p').first().locator('span.block').nth(1)).toContainText('Merav says');
  const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
  expect(violations).toEqual([]);
});

test('a character the opening names has a card before the first turn', async ({ page }) => {
  const utility = 'http://localhost:9996';
  let introductions = 0;
  await page.route(`${utility}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    const card = {
      scene: {},
      entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', appearance: 'Grey braid.', facts: [] }],
      speakers: [],
    };
    const content = prompt.includes('New here: Tamsin') && ++introductions ? JSON.stringify(card) : 'Merav found the map.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, { opening: 'The ferry waits.\n\n"Hold the lamp," Tamsin says.', utility: `${utility}/` });

  await expect(page.getByRole('button', { name: 'Characters · 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await expect(page.getByRole('button', { name: 'Open Tamsin' })).toBeVisible();

  // The turn names only Merav, who has a card: no second call.
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  expect(introductions).toBe(1);
});

test('a canon conflict is shown on the fact and resolved from the drawer', async ({ page }) => {
  const fact = (id: string, value: string) => ({
    id,
    text: `the story says eyes is ${value}, but canon says grey`,
    fromAction: 2,
    source: 'memory' as const,
    conflict: true,
    claim: { key: 'eyes', value },
  });
  await openSeededAdventure(page, 3, undefined, {
    entities: [
      { id: 'ent_tamsin', name: 'Tamsin', canon: true, state: { eyes: 'grey' }, canonKeys: ['eyes'], facts: [fact('c1', 'blue'), fact('c2', 'green')] },
    ],
  });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Tamsin' }).click();
  const drawer = page.getByRole('dialog', { name: 'Tamsin' });
  await expect(drawer.getByText('canon', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Lock eyes as canon' })).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.getByText('conflict', { exact: true })).toHaveCount(2);
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(violations).toEqual([]);
  await drawer.getByRole('listitem').filter({ hasText: 'green' }).getByRole('button', { name: 'Keep canon' }).click();
  await expect(drawer.getByText(/eyes is green/)).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Accept the story' }).click();
  await expect(drawer.getByText('conflict', { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Lock eyes as canon' })).toHaveAttribute('aria-pressed', 'false');
  await expect(drawer.getByRole('textbox', { name: 'eyes' })).toHaveValue('blue');
  await page.keyboard.press('Escape');
  await expect(page.getByText('eyes: blue')).toBeVisible();
});

test('no portraits beside dialogue when the setting is off', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: OPENING, speakerAvatars: false });
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('You wait.')).toBeVisible();
  await expect(page.locator('#story').getByText('Merav says', { exact: true })).toHaveCount(0);
});
