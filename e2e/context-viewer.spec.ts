import { expect, test, type Page } from '@playwright/test';

async function connectDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Import has no memories, so two are written straight into the store, covering actions 1-6 and 7-12. */
async function seedMemories(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const all = <T>(store: string) =>
      new Promise<T[]>((ok, fail) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.addEventListener('success', () => ok(r.result as T[]));
        r.addEventListener('error', () => fail(r.error));
      });
    const [adv] = await all<{ id: string }>('adventures');
    const ids = (await all<{ id: string; seq: number }>('actions')).toSorted((a, b) => a.seq - b.seq).map((a) => a.id);
    const tx = db.transaction('memories', 'readwrite');
    for (const i of [0, 1]) {
      const from = i * 6;
      tx.objectStore('memories').put({
        adventureId: adv?.id,
        id: `mem_${i}`,
        text: `Memory ${i + 1} of the salt road.`,
        fromAction: from,
        toAction: from + 6,
        actionIds: ids.slice(from, from + 6),
        useCount: 0,
        createdAt: i,
      });
    }
    await new Promise((ok) => tx.addEventListener('complete', ok));
    db.close();
  });
}

test('the Memories tab shows the bank and marks edited ranges stale', async ({ page }) => {
  await connectDemo(page);
  const actions = Array.from({ length: 14 }, (_, i) => (i % 2 ? { text: `> You walk on ${i}.`, type: 'do' } : { text: `The road bends ${i}.` }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import…' }).click();
  const aid = { title: 'Salt Road', actions };
  await (await chooser).setFiles({ name: 'salt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(aid)) });
  await expect(page.getByRole('button', { name: 'Continue Salt Road 14 actions' })).toBeVisible();
  await seedMemories(page);
  await page.getByRole('button', { name: 'Continue Salt Road 14 actions' }).click();

  const openMemories = async () => {
    await page.getByRole('button', { name: 'View context' }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Context sent to the model' });
    await dialog.getByRole('button', { name: 'Memories' }).click();
    return dialog;
  };
  let dialog = await openMemories();
  await expect(dialog.getByTestId('memory-counts')).toHaveText('used 0 · stored 2 · stale 0 · forgotten 0');
  await expect(dialog.getByText('actions 7–12')).toBeVisible();
  await page.keyboard.press('Escape');

  const covered = page.getByText('The road bends 2.');
  await covered.dblclick();
  await covered.click(); // focus the now-editable paragraph
  await page.keyboard.press('End');
  await page.keyboard.type(' A gull cries.');
  await page.getByRole('textbox', { name: 'Take a turn' }).click();
  await expect(page.getByText('The road bends 2. A gull cries.')).toBeVisible();

  dialog = await openMemories();
  await expect(dialog.getByTestId('memory-counts')).toHaveText('used 0 · stored 1 · stale 1 · forgotten 0');
  await expect(dialog.getByText('stale', { exact: true })).toBeVisible();
});
