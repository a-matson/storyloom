import { expect, test, type Page } from '@playwright/test';
import { openSeededAdventure } from './seed';

/** An adventure whose opening names `said`, with a card for `known`; the turn read cards `said`. */
async function open(page: Page, opening: string, said: string, known: { id: string; name: string; description: string }) {
  const utility = 'http://localhost:9995';
  await page.route(`${utility}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/props') return route.fulfill({ json: { model_path: '/models/qwen-3b.gguf', total_slots: 1 } });
    if (path !== '/completion') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    const card = { scene: {}, entities: [{ name: said, kind: 'character', description: known.description }], speakers: [] };
    const content = prompt.includes(`New here: ${said}`) ? JSON.stringify(card) : 'Merav found the map.';
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content, stop: true })}\n\n` });
  });
  await openSeededAdventure(page, 3, undefined, { opening, utility: `${utility}/`, entities: [known] });
  await page.getByRole('button', { name: /^Characters/ }).click();
}

/** The proposal shows without a card, and Yes adds it as the known one's alias. */
async function accept(page: Page, said: string, known: string) {
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByText(`${said} = ${known}?`)).toBeVisible();
  await expect(sidebar.getByRole('button', { name: `Open ${said}` })).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Yes' }).click();
  await expect(sidebar.getByText(`${said} = ${known}?`)).toHaveCount(0);
  await sidebar.getByRole('button', { name: `Open ${known}` }).click();
  await expect(page.getByRole('dialog', { name: known }).getByRole('textbox', { name: 'Also called (comma-separated)' })).toHaveValue(said);
}

test('a misspelt known name is proposed as an alias, and Yes adds it to the card', async ({ page }) => {
  await open(page, 'The ferry waits.\n\n"Hold the lamp," Weaver says.', 'Weaver', { id: 'ent_weever', name: 'Weever', description: 'A ferrywoman.' });
  await accept(page, 'Weaver', 'Weever');
});

test('a name the story gives a known one is proposed as an alias, and Yes adds it to the card', async ({ page }) => {
  await open(page, 'The gate creaks.\n\nVorthak, known as Old Red, grins at you.', 'Old Red', { id: 'ent_vorthak', name: 'Vorthak', description: 'An orc.' });
  await accept(page, 'Old Red', 'Vorthak');
});
