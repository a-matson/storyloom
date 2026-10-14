import { expect, type Page, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

const world = (page: Page) => page.getByRole('button', { name: /^World/ }).click();

async function rawPrompt(page: Page, input: string) {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(input);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  return context;
}

// The demo backend's turn read answers with a scene when the passage has a lighthouse.
test('the turn read fills the Now card and its timeline', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: 'You climb to the lighthouse with Merav.' });
  await world(page);
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('the lighthouse');
  await expect(page.getByRole('textbox', { name: 'Present' })).toHaveValue('Merav');
  await expect(page.getByRole('combobox', { name: 'Weather' })).toHaveValue('fog');
  await expect(page.getByRole('list', { name: 'Scene timeline' })).toHaveText('action 2 · the lighthouse');
});

// The lighthouse is a new place while the scene was at the seeded Old Well: the Places list asks once.
test('a new place asks whether it is inside the last one, and Yes records it', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: 'You climb to the lighthouse with Merav.', scene: { location: 'Old Well', present: ['Merav'] } });
  await world(page);
  await expect(page.getByText('Is the lighthouse inside Old Well?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('Is the lighthouse inside Old Well?')).toHaveCount(0);
  await page.getByText('Places', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'the lighthouse is inside' })).toHaveValue('ent_well');
});

// The seeded `time` is an old save's clock: it stays in the data but never reaches the prompt.
test('a seeded scene shows in the Now card and an edit persists', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'the Old Well', present: ['Merav'], time: { day: 2, part: 'evening' } } });
  await world(page);
  // The saved names resolve to the cards on open, so the place reads as its card name.
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('Old Well');
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('storm');
  await page.reload();
  await world(page);
  await expect(page.getByRole('combobox', { name: 'Weather' })).toHaveValue('storm');
  const context = await rawPrompt(page, 'drink from the well');
  await expect(context.getByText('[Scene: Old Well · Present: Merav · Storm]')).toBeVisible();
});

test('a state set on the Now card is in the next prompt; ✕ ends it and Undo brings it back', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'Old Well', present: ['Merav'] } });
  await world(page);
  await page.getByRole('combobox', { name: 'State of Merav' }).selectOption('mood');
  await page.getByRole('textbox', { name: 'New mood of Merav' }).fill('wary');
  await page.getByRole('button', { name: 'Set mood of Merav' }).click();
  const cast = page.getByRole('list', { name: 'Cast' });
  await expect(cast).toContainText('wary');
  let context = await rawPrompt(page, 'wave');
  await expect(context).toContainText('maps): wary.');
  await page.keyboard.press('Escape');

  await cast.getByRole('button', { name: 'End mood: wary' }).click();
  await expect(cast.getByText(/^Merav /)).not.toContainText('wary');
  context = await rawPrompt(page, 'wave again');
  await expect(context).toContainText('salt road maps).');
  await expect(context).not.toContainText('maps): wary');
  await page.keyboard.press('Escape');

  await cast.getByRole('button', { name: 'Undo' }).click();
  await expect(cast.getByText(/^Merav /)).toContainText('wary');
});

test('a character asleep is told in the prompt what they slept through', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'Old Well', present: ['Merav'] } });
  await world(page);
  await page.getByRole('combobox', { name: 'State of Merav' }).selectOption('condition');
  await page.getByRole('textbox', { name: 'New condition of Merav' }).fill('asleep');
  await page.getByRole('button', { name: 'Set condition of Merav' }).click();
  const cast = page.getByRole('list', { name: 'Cast' });
  // Asleep from the next action on: nothing missed yet.
  await expect(cast).not.toContainText('slept through');
  const context = await rawPrompt(page, 'whisper the secret');
  await expect(context).toContainText('maps): asleep; slept through action 3.');
  await page.keyboard.press('Escape');
  await expect(cast).toContainText('slept through action');
  await expect(cast.getByRole('button', { name: 'Show action 3 in the story' })).toHaveCount(2);
});

test('merging two places keeps one, with the other name as an alias', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, {
    scene: { location: 'the dry well', present: ['Merav'] },
    entities: [{ id: 'ent_dry', kind: 'place', name: 'the dry well', description: 'A dry well.' }],
  });
  await world(page);
  await page.getByText('Places', { exact: true }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('combobox', { name: 'Merge the dry well into' }).selectOption('ent_well');
  const places = page.getByRole('list', { name: 'Places' });
  await expect(places.getByRole('listitem')).toHaveCount(1);
  await expect(places).toContainText('Old Well · the dry well');
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('Old Well');
});
