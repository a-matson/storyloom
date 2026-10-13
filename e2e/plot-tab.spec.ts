import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('there is no Scene section before the turn read writes a scene', async ({ page }) => {
  await openSeededAdventure(page, 3);
  await expect(page.getByText('Story Summary', { exact: true })).toBeVisible();
  await expect(page.getByText('Scene', { exact: true })).toHaveCount(0);
});

// The demo backend's turn read answers with a scene when the passage has a lighthouse.
test('the turn read fills the Scene section and its timeline', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: 'You climb to the lighthouse with Merav.' });
  await page.getByText('Scene', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('the lighthouse');
  await expect(page.getByRole('textbox', { name: 'Present' })).toHaveValue('Merav');
  await expect(page.getByRole('combobox', { name: 'Weather' })).toHaveValue('fog');
  await expect(page.getByRole('list', { name: 'Scene timeline' })).toHaveText('action 2 · the lighthouse');
});

// The lighthouse is a new place while the scene was at the seeded Old Well: the section asks once.
test('a new place asks whether it is inside the last one, and Yes records it', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: 'You climb to the lighthouse with Merav.', scene: { location: 'Old Well', present: ['Merav'] } });
  await page.getByText('Scene', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('the lighthouse');
  await expect(page.getByText('Is the lighthouse inside Old Well?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('Is the lighthouse inside Old Well?')).toHaveCount(0);
  // The save is debounced.
  const partOf = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((ok) => {
        const r = indexedDB.open('storyloom');
        r.addEventListener('success', () => ok(r.result));
      });
      const all = await new Promise<{ name: string; partOf?: string }[]>((ok) => {
        const r = db.transaction('entities').objectStore('entities').getAll();
        r.addEventListener('success', () => ok(r.result as { name: string; partOf?: string }[]));
      });
      return all.find((e) => e.name === 'the lighthouse')?.partOf;
    });
  await expect.poll(partOf).toBe('ent_well');
});

// The seeded `time` is an old save's clock: it stays in the data but never reaches the prompt.
test('a seeded scene shows in the Plot tab and an edit persists', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'the Old Well', present: ['Merav'], time: { day: 2, part: 'evening' } } });
  await page.getByText('Scene', { exact: true }).click();
  // The saved names resolve to the cards on open, so the place reads as its card name.
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('Old Well');
  await expect(page.getByRole('textbox', { name: 'Present' })).toHaveValue('Merav');
  await page.getByRole('combobox', { name: 'Weather' }).selectOption('storm');

  await page.reload();
  await page.getByText('Scene', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Weather' })).toHaveValue('storm');

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('drink from the well');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context.getByText('[Scene: Old Well · Present: Merav · Storm]')).toBeVisible();
});

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
  await expect(page.getByText('Updates when older text leaves the context. Your edits are kept as the base for the next summary.')).toBeVisible();

  // Reloading straight away is the regression: the edit is still inside the save debounce.
  await page.reload();
  await page.getByText('Story Summary', { exact: true }).click();
  await expect(summary).toHaveValue('Mira owes the ferryman a silver coin.');
});
