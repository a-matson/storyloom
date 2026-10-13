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
  expect((await drawer.locator('span[aria-hidden="true"]', { hasText: /^M$/ }).boundingBox())?.width).toBe(32);

  await drawer.getByRole('button', { name: 'Edit location: the well' }).click();
  await drawer.getByRole('textbox', { name: 'Edit: location: the well' }).fill('the gate');
  await page.keyboard.press('Enter');
  await drawer.getByRole('button', { name: 'Pin: She keeps the needle map.' }).click();
  await expect(drawer.getByRole('button', { name: 'Pin: She keeps the needle map.' })).toHaveAttribute('aria-pressed', 'true');
  await drawer.getByRole('button', { name: 'Promote to story card' }).click();
  await expect(drawer.getByRole('button', { name: 'Is a story card' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open Merav' })).toContainText('location: the gate');

  await page.getByRole('button', { name: 'Story cards · 1' }).click();
  await expect(page.getByRole('button', { name: 'Edit story card Merav' })).toBeVisible();

  // A fact's evidence jumps to its passage.
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await expect(page.getByText('The road bends 2.')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Evidence: She keeps the needle map.' }).click();
  await page.getByRole('button', { name: 'Go to passage' }).click();
  await expect(page.getByText('The road bends 2.')).toBeInViewport();
});

test("an item the player holds is in the scene line and on the holder's card", async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { entities: [{ id: 'ent_lantern', kind: 'item', name: 'Lantern', description: 'A storm lantern.' }] });
  await page.getByRole('button', { name: 'World · 2' }).click();
  await page.getByRole('button', { name: 'Open Lantern' }).click();
  const drawer = page.getByRole('dialog', { name: 'Lantern' });
  await drawer.getByRole('combobox', { name: 'Held by' }).selectOption('you');
  await drawer.getByRole('combobox', { name: 'Held by' }).selectOption('Merav');
  await page.keyboard.press('Escape');
  await expect(page.getByText('held by Merav')).toBeVisible();

  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await page.getByRole('dialog', { name: 'Merav' }).getByRole('button', { name: 'Lantern' }).click();
  await page.getByRole('dialog', { name: 'Lantern' }).getByRole('combobox', { name: 'Held by' }).selectOption('you');
  await page.keyboard.press('Escape');

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('raise the lantern');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context.getByText('[Scene: You hold: Lantern]')).toBeVisible();
});

test('a portrait is queued on open; a failed one shows why and Retry draws it', async ({ page }) => {
  const images = 'http://localhost:7999';
  const requests: { prompt: string; seed: number; width: number }[] = [];
  let fail = true;
  await page.route(`${images}/**`, async (route) => {
    if (new URL(route.request().url()).pathname !== '/sdapi/v1/txt2img') return route.fulfill({ json: [] });
    requests.push(route.request().postDataJSON() as { prompt: string; seed: number; width: number });
    // KoboldCpp's failed render: 200 with an empty image.
    return route.fulfill({ json: { images: [fail ? '' : PNG] } });
  });
  await openSeededAdventure(page, 3, `${images}/`);

  await page.getByRole('button', { name: 'Characters · 1' }).click();
  const card = page.getByRole('button', { name: 'Open Merav' });
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Merav' });
  await expect(drawer.getByText('Could not draw the portrait: The image server returned no image')).toBeVisible();
  expect(requests).toEqual([expect.objectContaining({ prompt: expect.stringMatching(/^portrait, head and shoulders, A well-warden/), width: 384 })]);
  fail = false;
  await drawer.getByRole('button', { name: 'Retry' }).click();
  await expect(drawer.getByRole('button', { name: 'Redraw' })).toBeEnabled();
  expect(requests[1]?.seed).toBe(requests[0]?.seed);
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

test('a paragraph naming one character gets its face without a speaker label', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: 'The well is dry.\n\nMerav unrolls the map.' });
  const blocks = page.locator('#story p').first().locator('span.block');
  await expect(blocks.nth(1).locator('span[aria-hidden="true"]')).toHaveText('M');
  await expect(blocks.nth(0).locator('span[aria-hidden="true"]')).toHaveCount(0);
  await expect(page.locator('#story').getByText('Merav says', { exact: true })).toHaveCount(0);
  // The face opens that character's card.
  await page.locator('#story').getByRole('button', { name: 'Open Merav' }).click();
  await expect(page.getByRole('dialog', { name: 'Merav' })).toBeVisible();
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
      entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', looks: { hair: 'grey braid' } }],
      speakers: [],
    };
    const content = prompt.includes('New here: Tamsin') && ++introductions ? JSON.stringify(card) : 'Merav found the map.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, { opening: 'The ferry waits.\n\n"Hold the lamp," Tamsin says.', utility: `${utility}/` });

  await expect(page.getByRole('button', { name: 'Characters · 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Open Tamsin' })).toBeVisible();

  // The turn names only Merav, who has a card: no second call.
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  expect(introductions).toBe(1);
});

test('a misspelt known name is proposed as an alias, and Yes adds it to the card', async ({ page }) => {
  const utility = 'http://localhost:9995';
  await page.route(`${utility}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    const card = { scene: {}, entities: [{ name: 'Weaver', kind: 'character', description: 'A ferrywoman.' }], speakers: [] };
    const content = prompt.includes('New here: Weaver') ? JSON.stringify(card) : 'Merav found the map.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, {
    opening: 'The ferry waits.\n\n"Hold the lamp," Weaver says.',
    utility: `${utility}/`,
    entities: [{ id: 'ent_weever', name: 'Weever', description: 'A ferrywoman.' }],
  });

  await page.getByRole('button', { name: /^Characters/ }).click();
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByText('Weaver = Weever?')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Open Weaver' })).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Yes' }).click();
  await expect(sidebar.getByText('Weaver = Weever?')).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Open Weever' }).click();
  await expect(page.getByRole('dialog', { name: 'Weever' }).getByRole('textbox', { name: 'Also called (comma-separated)' })).toHaveValue('Weaver');
});

test("the story's current state shows as a row, and the player's edit ends it", async ({ page }) => {
  const state = (id: string, value: string, fromAction: number, until?: number) => ({
    id,
    text: `location: ${value}`,
    fromAction,
    source: 'memory' as const,
    kind: 'state' as const,
    key: 'location',
    value,
    ...(until !== undefined && { until }),
  });
  await openSeededAdventure(page, 3, undefined, {
    entities: [{ id: 'ent_tamsin', name: 'Tamsin', state: {}, facts: [state('s1', 'the tavern', 1, 2), state('s2', 'the docks', 2)] }],
  });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Tamsin' }).click();
  const drawer = page.getByRole('dialog', { name: 'Tamsin' });
  await expect(drawer.getByRole('button', { name: 'Edit location: the docks' })).toBeVisible();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'location: the tavern' })).toContainText('action 1');
  await drawer.getByRole('button', { name: 'Edit location: the docks' }).click();
  await drawer.getByRole('textbox', { name: 'Edit: location: the docks' }).fill('the ferry');
  await drawer.getByRole('textbox', { name: 'Edit: location: the docks' }).blur();
  // Ended: now under Happened with its action.
  await expect(drawer.getByRole('listitem').filter({ hasText: 'location: the docks' })).toContainText('action 2');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Tamsin' })).toContainText('location: the ferry');
});

test('card lines: evidence, edit, delete and add', async ({ page }) => {
  const fact = { id: 'f9', text: 'Sells salt.', fromAction: 1, source: 'memory' as const, sourceId: 'action:1', evidence: 'bends 1' };
  await openSeededAdventure(page, 3, undefined, { entities: [{ id: 'ent_corrow', name: 'Corrow', facts: [fact, { ...fact, id: 'f8', text: 'Hums.' }] }] });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Corrow' }).click();
  const drawer = page.getByRole('dialog', { name: 'Corrow' });

  await drawer.getByRole('button', { name: 'Evidence: Sells salt.' }).click();
  await expect(drawer.locator('mark')).toHaveText('bends 1');
  await expect(drawer.getByText('action 1', { exact: true })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(violations).toEqual([]);

  await drawer.getByRole('button', { name: 'Edit Sells salt.' }).click();
  await drawer.getByRole('textbox', { name: 'Edit: Sells salt.' }).fill('Sells rope.');
  await page.keyboard.press('Enter');
  // The player's words now: the basis is "yours", with no evidence to open.
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Sells rope.' })).toContainText('yours');
  await expect(drawer.getByRole('button', { name: 'Evidence: Sells rope.' })).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Delete: Hums.' }).click();
  await expect(drawer.getByText('Hums.')).toHaveCount(0);

  await drawer.getByRole('combobox', { name: 'Add what' }).selectOption('state');
  await drawer.getByRole('textbox', { name: 'New line' }).fill('mood: wary');
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'mood: wary' })).toContainText('yours');
});

test('a fact goes when the action it came from is edited', async ({ page }) => {
  // A state: the cast sends a present character's states, not model traits.
  const fact = {
    id: 'f9',
    text: 'role: salt seller',
    kind: 'state' as const,
    key: 'role',
    value: 'salt seller',
    fromAction: 1,
    source: 'memory' as const,
    sourceId: 'action:1',
    evidence: 'bends 1',
  };
  await openSeededAdventure(page, 3, undefined, { scene: { present: ['Corrow'] }, entities: [{ id: 'ent_corrow', name: 'Corrow', facts: [fact] }] });
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByRole('switch', { name: 'Send entity facts and cards' }).click();
  const prompt = async () => {
    await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'View context' }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Context sent to the model' });
    await dialog.getByRole('button', { name: 'Raw prompt' }).click();
    return dialog;
  };
  await expect((await prompt()).getByText(/Corrow: role: salt seller/)).toBeVisible();
  await page.keyboard.press('Escape');

  const older = page.getByText('The road bends 1.');
  await older.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('The road ends.');
  await page.getByRole('textbox', { name: 'Take a turn' }).focus(); // blur commits
  await expect(page.getByText('The road ends.')).toBeVisible();

  await page.getByRole('tab', { name: 'Adventure' }).click();
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Corrow' }).click();
  await expect(page.getByRole('dialog', { name: 'Corrow' }).getByText(/salt seller/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect((await prompt()).getByText(/salt seller/)).toHaveCount(0);
});

test('no portraits beside dialogue when the setting is off', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: OPENING, speakerAvatars: false });
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('wait');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('You wait.')).toBeVisible();
  await expect(page.locator('#story').getByText('Merav says', { exact: true })).toHaveCount(0);
});
