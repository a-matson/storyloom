import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('a free-text locked key gets a proposal, not a conflict; accepting it keeps the lock', async ({ page }) => {
  const line = { subject: 'ent_tamsin', at: 1, since: 1, kind: 'look' as const, key: 'hair' };
  await openSeededAdventure(page, 3, undefined, {
    entities: [{ id: 'ent_tamsin', name: 'Tamsin', canonKeys: ['hair'] }],
    assertions: [
      { ...line, id: 'as_hair', producer: 'player', basis: 'player', value: 'black' },
      { ...line, id: 'as_said', producer: 'batch', basis: 'stated', value: 'black braid', seen: false },
    ],
  });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Tamsin' }).click();
  const drawer = page.getByRole('dialog', { name: 'Tamsin' });
  await expect(drawer.getByRole('listitem').filter({ hasText: 'hair: black' }).first()).toBeVisible();
  await expect(drawer.getByText('proposal', { exact: true })).toBeVisible();
  await expect(drawer.getByText('conflict', { exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Accept the story' }).click();
  await expect(drawer.getByText('proposal', { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('listitem').filter({ hasText: 'hair: black braid' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Lock hair as canon' })).toHaveAttribute('aria-pressed', 'true');
});

test('an identity that contradicts the species look: keeping the looks rewrites the identity', async ({ page }) => {
  const line = { subject: 'ent_minos', producer: 'batch' as const, basis: 'stated' as const, at: 1, since: 1 };
  await openSeededAdventure(page, 3, undefined, {
    entities: [{ id: 'ent_minos', name: 'Minos' }],
    assertions: [
      { ...line, id: 'as_id', kind: 'identity', text: 'A massive orc at the gate.' },
      { ...line, id: 'as_sp', kind: 'look', key: 'species', value: 'minotaur' },
      { ...line, id: 'as_c', kind: 'conflict', key: 'species', claimed: 'orc', canon: 'minotaur', seen: false },
    ],
  });
  await page.getByRole('button', { name: 'Characters · 2' }).click();
  await page.getByRole('button', { name: 'Open Minos' }).click();
  const drawer = page.getByRole('dialog', { name: 'Minos' });
  const clash = drawer.getByRole('listitem').filter({ hasText: 'the identity says orc; the looks say minotaur' });
  await expect(clash.getByRole('button', { name: 'Keep the identity' })).toBeVisible();
  await clash.getByRole('button', { name: 'Keep the looks' }).click();
  await expect(drawer.getByText('conflict', { exact: true })).toHaveCount(0);
  await expect(drawer.getByLabel('Description')).toHaveValue('A massive minotaur at the gate.');
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
  await expect(drawer.getByRole('listitem').filter({ hasText: 'eyes: blue' })).toBeVisible();
  await page.keyboard.press('Escape');
  // On the card: once a background read places Tamsin in the scene, the cast panel shows the same line.
  await expect(page.getByRole('button', { name: 'Open Tamsin' })).toContainText('eyes: blue');
});
