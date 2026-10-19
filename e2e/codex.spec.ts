import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('the codex lists each character with their events, searches, jumps and exports (M27-1)', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('button', { name: 'Open codex' }).click();
  const codex = page.getByRole('dialog', { name: 'Codex' });
  // Under Tamsin, Merav and the timeline.
  await expect(codex.getByRole('button', { name: rowed.text })).toHaveCount(3);

  await codex.getByRole('searchbox', { name: 'Search the codex' }).fill('nothing like it');
  await expect(codex.getByRole('button', { name: rowed.text })).toHaveCount(0);
  await codex.getByRole('searchbox', { name: 'Search the codex' }).fill('ROWED');
  await expect(codex.getByRole('button', { name: rowed.text })).toHaveCount(3);

  const download = page.waitForEvent('download');
  await codex.getByRole('button', { name: 'Export Markdown' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Salt_Road.codex.md');
  expect(await readFile(await file.path(), 'utf8')).toContain(`## Timeline\n\n- (1) ${rowed.text}`);

  await codex.getByRole('button', { name: rowed.text }).first().click();
  await expect(codex).toBeHidden();
});
