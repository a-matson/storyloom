import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function connectDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('the scenario grid plays, edits and deletes a scenario', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You are ${character.name}, on the night ferry.');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Night Ferry');
  await page.getByRole('textbox', { name: 'Tags' }).fill('mystery, sea');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  await expect(page.getByText('Story · 1 placeholder · 0 cards')).toBeVisible();
  await expect(page.getByText('sea', { exact: true })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.getByRole('button', { name: 'Night Ferry', exact: true }).click();
  await expect(page).toHaveURL(/#\/scenario\//);
  await page.getByRole('button', { name: 'Back to library' }).click();

  await page.getByRole('button', { name: 'Play Night Ferry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Night Ferry' });
  await dialog.getByRole('textbox', { name: "Enter your character's name…" }).fill('Merav');
  await dialog.getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText('You are Merav, on the night ferry.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete Night Ferry' }).click();
  await expect(page.getByRole('button', { name: 'Play Night Ferry' })).toHaveCount(0);
  // The adventure outlives its scenario.
  await expect(page.getByRole('button', { name: 'Open Night Ferry' })).toBeVisible();
});

test('card placeholders are filled when the adventure is created', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  // No placeholder in the prompt: the question below can only come from the card.
  await page.getByRole('textbox', { name: 'Prompt' }).fill('The ferry horn sounds twice.');
  const rail = page.getByRole('complementary', { name: 'Scenario overview' });
  await rail.getByRole('button', { name: '+ New' }).click();
  await page.locator('#card-name').fill('Ferryman');
  await page.locator('#card-entry').fill('The ferryman never looks up from his rope, not even for ${character.name}.');
  await page.locator('#card-triggers').fill('${character.name},rope');
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Night Ferry');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  await page.getByRole('button', { name: 'Play Night Ferry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Night Ferry' });
  await dialog.getByRole('textbox', { name: "Enter your character's name…" }).fill('Merav');
  await dialog.getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  await page.getByRole('button', { name: 'Story cards · 1' }).click();
  await expect(page.getByText('Merav,rope')).toBeVisible();
  await page.getByRole('button', { name: 'Edit story card Ferryman' }).click();
  await expect(page.locator('#card-entry')).toHaveValue('The ferryman never looks up from his rope, not even for Merav.');
  await expect(page.locator('#card-triggers')).toHaveValue('Merav,rope');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // The Character card seeds a canon entity.
  await page.getByRole('button', { name: 'Characters · 1' }).click();
  await expect(page.getByRole('button', { name: 'Open Ferryman' }).getByText('canon', { exact: true })).toBeVisible();

  // The scenario is not mutated: its card still holds the placeholder, so it still counts one.
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByText('Story · 1 placeholder · 1 card')).toBeVisible();
});

// 1x1 PNG; the upload path re-encodes it through a canvas, so an invalid one would fail the test.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IWcDAALUASNyYth2AAAAAElFTkSuQmCC';

test('an uploaded cover survives a reload and shows on the library card', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Covered');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload…' }).click()]);
  await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await expect(page.locator('div[style*="blob:"]')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();

  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Covered', exact: true })).toBeVisible();
  await expect(page.locator('div[style*="blob:"]')).toBeVisible();
});

test('a generated cover is re-encoded like an uploaded one', async ({ page }) => {
  const images = 'http://localhost:7999';
  await page.route(`${images}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { images: [PNG] } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill(`${images}/`);
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('sd_xl_base.safetensors')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'lantern-lit tavern, rainy night, painted illustration' }).fill('a quiet harbour');
  await page.getByRole('button', { name: 'Generate' }).click();

  const thumb = page.locator('div[style*="blob:"]');
  await expect(thumb).toBeVisible();
  const url = (await thumb.getAttribute('style'))?.match(/blob:[^"')]+/)?.[0] ?? '';
  // The PNG the server returned is stored as WebP: generate goes through the same downscale as upload.
  expect(await page.evaluate(async (u) => (await fetch(u)).blob().then((b) => b.type), url)).toBe('image/webp');
});

test('"Surprise me" opens an adventure written by the model', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText(/Merav|Wind pushes salt|pinpricks|"Don't,"/).first()).toBeVisible();
});
