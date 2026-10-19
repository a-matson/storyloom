import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('before turn 1 the canon editor adds a character and locks its species', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  const hint = page.getByText('Set who is who before you play');
  await hint.getByRole('button', { name: 'Canon' }).click();
  const drawer = page.getByRole('dialog', { name: 'Canon' });
  await drawer.getByRole('textbox', { name: 'Add a character' }).fill('Mira');
  await drawer.getByRole('textbox', { name: 'Add a character' }).press('Enter');
  const mira = drawer.getByRole('region', { name: 'Mira' });
  await mira.getByRole('textbox', { name: 'species' }).fill('kobold');
  await mira.getByRole('switch', { name: 'Lock species' }).click();
  await expect(mira.getByText('Canon', { exact: true })).toBeVisible();
  await expect(mira.getByRole('textbox', { name: 'species' })).toHaveValue('kobold');
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await drawer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Mira' }).click();
  await expect(page.getByRole('button', { name: 'Lock species as canon' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('dialog', { name: 'Mira' }).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(hint).toHaveCount(0);
});

test('a locked species survives an output that names another: a conflict on the card and a flag', async ({ page }) => {
  const STORY = 'http://localhost:9994';
  await page.route(`${STORY}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/story.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    // The reply calls Mira a human and names a newcomer, so the turn read folds Mira's looks with Tamsin's card.
    const read = {
      scene: { location: 'the gate', present: ['Mira'], weather: 'unchanged' },
      entities: [
        { name: 'Tamsin', kind: 'character', description: 'A ferrywoman.' },
        { name: 'Mira', kind: 'character', description: 'A scout.', looks: { species: 'human' } },
      ],
    };
    const locked = /^- (Mira: species is .+)$/m.exec(prompt)?.[1];
    const content = prompt.includes('Established facts:')
      ? JSON.stringify(locked ? { contradicts: true, fact: locked } : { contradicts: false, fact: '' })
      : prompt.includes('Where does the passage end')
        ? JSON.stringify(read)
        : ' Mira, a human scout, nods to Tamsin.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Server URL' }).fill(STORY);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('story.gguf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();

  await page.getByText('Set who is who before you play').getByRole('button', { name: 'Canon' }).click();
  const drawer = page.getByRole('dialog', { name: 'Canon' });
  await drawer.getByRole('textbox', { name: 'Add a character' }).fill('Mira');
  await drawer.getByRole('textbox', { name: 'Add a character' }).press('Enter');
  const mira = drawer.getByRole('region', { name: 'Mira' });
  await mira.getByRole('textbox', { name: 'species' }).fill('kobold');
  await mira.getByRole('switch', { name: 'Lock species' }).click();
  await drawer.getByRole('button', { name: 'Close' }).click();

  const turn = async () => {
    await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  };
  // The first turn's read puts Mira in the scene; the second turn's check has her locked line.
  await turn();
  await turn();
  await expect(page.getByRole('status').filter({ hasText: 'May contradict: Mira: species is kobold' })).toBeVisible();

  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('complementary').getByRole('button', { name: 'Open Mira' }).click();
  const card = page.getByRole('dialog', { name: 'Mira' });
  await expect(card.getByText('conflict', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Lock species as canon' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByRole('listitem').filter({ hasText: 'species: kobold' }).first()).toBeVisible();
});
