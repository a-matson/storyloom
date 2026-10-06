import { expect, type Page } from '@playwright/test';

/**
 * Connect the demo backend, import an adventure of `count` short actions, seed two entities and open it.
 * Seeding comes before the first open: a session's save on close rewrites the entities table.
 */
export async function openSeededAdventure(
  page: Page,
  count: number,
  imageServer?: string,
  opts: { opening?: string; speakerAvatars?: boolean; contextScript?: string } = {},
): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  if (imageServer !== undefined) {
    await page.getByRole('switch', { name: 'Use an image server' }).click();
    await page.getByRole('textbox', { name: 'Image server URL' }).fill(imageServer);
  }
  if (opts.speakerAvatars === false) await page.getByRole('switch', { name: 'Speaker portraits beside dialogue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const actions = Array.from({ length: count }, (_, i) => ({ text: i === 0 && opts.opening !== undefined ? opts.opening : `The road bends ${i}.` }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import…' }).click();
  await (await chooser).setFiles({ name: 'salt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ title: 'Salt Road', actions })) });
  const open = page.getByRole('button', { name: `Continue Salt Road ${count} actions` });
  await expect(open).toBeVisible();
  await seedEntities(page, opts.contextScript);
  await open.click();
}

/** Two entities written straight into the store for the first adventure; the memory cycle never runs in e2e. An import carries no scripts, so a Context script is patched in too. */
async function seedEntities(page: Page, contextScript?: string): Promise<void> {
  await page.evaluate(async (context) => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const adv = await new Promise<{ id: string } | undefined>((ok, fail) => {
      const r = db.transaction('adventures').objectStore('adventures').getAll();
      r.addEventListener('success', () => ok((r.result as { id: string }[])[0]));
      r.addEventListener('error', () => fail(r.error));
    });
    const base = { adventureId: adv?.id, aliases: [], relations: [], firstSeen: 1, lastSeen: 2 };
    const tx = db.transaction(['entities', 'adventures'], 'readwrite');
    if (context && adv) tx.objectStore('adventures').put({ ...adv, scripts: { library: '', input: '', context, output: '' } });
    tx.objectStore('entities').put({
      ...base,
      id: 'ent_merav',
      kind: 'character',
      name: 'Merav',
      aliases: ['the well-warden'],
      description: 'A well-warden who keeps the salt road maps.',
      state: { location: 'the well' },
      facts: [
        { id: 'f1', text: 'She keeps the needle map.', fromAction: 2, source: 'memory' },
        { id: 'f2', text: 'She distrusts the caravan.', fromAction: 1, source: 'memory' },
      ],
      relations: [{ to: 'Corrow', label: 'owes' }],
    });
    tx.objectStore('entities').put({
      ...base,
      id: 'ent_well',
      kind: 'place',
      name: 'Old Well',
      description: 'A dry well at the edge of the flats.',
      state: {},
      facts: [],
    });
    await new Promise((ok) => tx.addEventListener('complete', ok));
    db.close();
  }, contextScript);
}
