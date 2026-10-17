import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('an event shows under Happened on every card that took part, with its action', async ({ page }) => {
  const rowed = {
    id: 'as_rowed',
    subject: 'ent_tamsin',
    producer: 'batch' as const,
    at: 1,
    basis: 'stated' as const,
    since: 1,
    kind: 'event' as const,
    text: 'Tamsin rowed Merav across the river.',
    who: ['ent_tamsin', 'ent_merav'],
  };
  await openSeededAdventure(page, 3, undefined, { entities: [{ id: 'ent_tamsin', name: 'Tamsin' }], assertions: [rowed] });
  await page.getByRole('button', { name: 'Characters · 2' }).click();

  await page.getByRole('button', { name: 'Open Merav' }).click();
  const merav = page.getByRole('dialog', { name: 'Merav' });
  await expect(merav.getByRole('listitem').filter({ hasText: rowed.text })).toContainText('action 1');
  await merav.getByRole('button', { name: 'Show action 1 in the story' }).click();
  await expect(merav).toBeHidden();

  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Tamsin' }).click();
  const tamsin = page.getByRole('dialog', { name: 'Tamsin' });
  await expect(tamsin.getByRole('listitem').filter({ hasText: rowed.text })).toContainText('action 1');
  await tamsin.getByRole('combobox', { name: 'Add what' }).selectOption('event');
  await tamsin.getByRole('textbox', { name: 'New line' }).fill('Pulled you from the river.');
  await tamsin.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(tamsin.getByRole('listitem').filter({ hasText: 'Pulled you from the river.' })).toContainText('yours');
});
