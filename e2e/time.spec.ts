import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('/time and /travel set the scene without an action; the next prompt carries the time', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { scene: { location: 'Old Well', present: ['Merav'] } });
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  const actions = page.locator('#story [data-action-id]');
  await expect(actions).toHaveCount(3);

  await input.fill('/time evening, day 2');
  await input.press('Enter');
  await expect(page.getByText('Now Day 2, evening')).toBeVisible();
  await input.fill('/travel The Docks');
  await input.press('Enter');
  await expect(page.getByText('No known way from Old Well to The Docks: linked them (World tab)')).toBeVisible();
  await input.fill('/wait soon');
  await input.press('Enter');
  await expect(page.getByText('Could not read "soon": try /wait 3 hours')).toBeVisible();
  await expect(actions).toHaveCount(3);

  await page.getByRole('button', { name: /^World/ }).click();
  await expect(page.getByRole('combobox', { name: 'Time of day' })).toHaveValue('evening');
  await expect(page.getByRole('spinbutton', { name: 'Day' })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('The Docks');

  await input.fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context).toContainText('[Scene: The Docks · Day 2, evening · Present: Merav');
});

test('/wait 8 hours ends a read mood; the notice says so', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, {
    scene: { location: 'Old Well', present: ['Merav'] },
    assertions: [{ id: 'as_mood', subject: 'ent_merav', producer: 'turn', at: 1, basis: 'stated', since: 1, kind: 'state', key: 'mood', value: 'furious' }],
  });
  await page.getByRole('button', { name: /^World/ }).click();
  const cast = page.getByRole('list', { name: 'Cast' });
  await expect(cast).toContainText('furious');

  const input = page.getByRole('textbox', { name: 'Take a turn' });
  await input.fill('/wait 8 hours');
  await input.press('Enter');
  await expect(page.getByText('Now Day 1, afternoon, moods and postures reset')).toBeVisible();
  await expect(cast).not.toContainText('furious');
});

test('/travel to a room of this place sets your room; alone, the company stays behind', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, {
    scene: { location: 'Old Well', present: ['Merav'] },
    entities: [{ id: 'ent_cellar', kind: 'place', name: 'the cellar', partOf: 'ent_well' }],
  });
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  await input.fill('/travel the cellar alone');
  await input.press('Enter');
  await expect(page.getByText('Travelled to the cellar, alone')).toBeVisible();

  await page.getByRole('button', { name: /^World/ }).click();
  await expect(page.getByRole('textbox', { name: 'Scene location' })).toHaveValue('Old Well');
  await expect(page.getByText('You: the cellar', { exact: true })).toBeVisible();
  await expect(page.getByText('Old Well · You: the cellar · In Old Well: Merav')).toBeVisible();

  await input.fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context).toContainText('[Scene: Old Well · You: the cellar · In Old Well: Merav]');
});

test('/travel across no known way links the places; a way through the gate reads on the scene line', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, {
    scene: { location: 'Old Well', present: [] },
    entities: [{ id: 'ent_docks', kind: 'place', name: 'the docks' }],
  });
  const input = page.getByRole('textbox', { name: 'Take a turn' });
  await input.fill('/travel the docks');
  await input.press('Enter');
  await expect(page.getByText('No known way from Old Well to the docks: linked them (World tab)')).toBeVisible();

  await page.getByRole('button', { name: /^World/ }).click();
  await page.getByText('Places', { exact: true }).click();
  const remove = page.getByRole('button', { name: 'Remove the way from Old Well to the docks' });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await page.getByRole('combobox', { name: 'the docks leads to' }).selectOption('ent_well');
  await page.getByRole('textbox', { name: 'Way from the docks goes through' }).fill('the gate');
  await page.getByRole('button', { name: 'Link the docks' }).click();
  await expect(page.getByRole('list', { name: 'Places' })).toContainText('to Old Well (through the gate)');

  await input.fill('/travel Old Well');
  await input.press('Enter');
  await expect(page.getByText('Travelled to Old Well')).toBeVisible();
  await input.fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context).toContainText('[Scene: Old Well (through the gate)');
});
