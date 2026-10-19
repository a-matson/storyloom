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

test('a card lists what the character knows, loaded on open (M27-2)', async ({ page }) => {
  const base = { subject: 'ent_tamsin', producer: 'batch' as const, basis: 'stated' as const, kind: 'event' as const };
  const rowed = { ...base, id: 'as_rowed', at: 1, since: 1, text: 'Tamsin rowed Merav across the river.', who: ['ent_tamsin', 'ent_merav'] };
  const alone = { ...base, id: 'as_alone', at: 2, since: 2, text: 'Tamsin buried the lantern.', who: ['ent_tamsin'] };
  await openSeededAdventure(page, 3, undefined, { entities: [{ id: 'ent_tamsin', name: 'Tamsin' }], assertions: [rowed, alone] });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  const merav = page.getByRole('dialog', { name: 'Merav' });
  await merav.getByText('What does Merav know?').click();
  const known = merav.getByRole('group').filter({ hasText: 'What does Merav know?' });
  await expect(known.getByRole('listitem').filter({ hasText: rowed.text })).toContainText('action 1');
  await expect(known).not.toContainText(alone.text);
});

test('events move a stance: the card shows trust and the event that swapped it (M26-6)', async ({ page }) => {
  const base = { subject: 'ent_tamsin', producer: 'batch' as const, basis: 'stated' as const };
  const ev = (at: number, text: string) => ({ ...base, id: `as_ev${at}`, at, since: at, kind: 'event' as const, text, who: ['ent_tamsin', 'ent_merav'] });
  const rel = { ...base, id: 'as_rel', subject: 'ent_merav', at: 0, since: 0, kind: 'relationship' as const, to: 'Tamsin', stance: 'wary of her' };
  await openSeededAdventure(page, 3, undefined, {
    entities: [{ id: 'ent_tamsin', name: 'Tamsin' }],
    assertions: [rel, ev(1, 'Tamsin rescued Merav from the river.'), ev(2, 'Tamsin healed Merav.')],
  });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  const line = page.getByRole('dialog', { name: 'Merav' }).getByRole('listitem').filter({ hasText: 'Tamsin: wary of her' });
  await expect(line.getByText('trust +2 · fear 0')).toHaveAttribute('title', 'Tamsin healed Merav.');
});
