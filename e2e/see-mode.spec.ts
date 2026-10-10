import { expect, test, type Page } from '@playwright/test';
import { openSeededAdventure } from './seed';

const IMAGES = 'http://localhost:7999';
// 1x1 grey PNG, the smallest thing an A1111 server can honestly return. Valid checksums: the
// hires pass decodes it with createImageBitmap, which is stricter than <img>.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Demo backend plus the mocked image server, into a fantasy adventure. */
async function openAdventure(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Use an image server' }).click();
  await page.getByRole('textbox', { name: 'Image server URL' }).fill(`${IMAGES}/`);
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(page.getByText('sd_xl_base.safetensors')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
}

/** `/see <prompt>`: the slash command only switches mode, so the prompt is sent by the second click. */
async function see(page: Page, prompt: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(`/see ${prompt}`);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Send' }).click();
}

test('See mode generates an image, keeps the caption and survives a reload', async ({ page }) => {
  const prompts: string[] = [];
  // A real render takes minutes, so one call is held back to show the waiting state.
  let delayMs = 0;
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    prompts.push((route.request().postDataJSON() as { prompt: string }).prompt);
    if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
    return route.fulfill({ json: { images: [PNG] } });
  });

  await openAdventure(page);

  delayMs = 3000;
  await see(page, 'a harbour at dusk');

  // The counter ticks while the server works: without it two minutes of "Generating…" reads as broken.
  await expect(page.getByRole('figure')).toContainText(/Generating… [1-9]\d* s/);
  delayMs = 0;

  await expect(page.getByRole('figure')).toContainText('a harbour at dusk');
  const image = page.getByRole('img', { name: 'a harbour at dusk' });
  await expect(image).toBeVisible();
  // The brief leads; the adventure's style follows it.
  expect(prompts).toEqual([expect.stringMatching(/^a harbour at dusk, \w/)]);

  // The blob is in IndexedDB, not in the action: the picture comes back after a reload.
  await page.reload();
  await expect(page.getByRole('img', { name: 'a harbour at dusk' })).toBeVisible();
  expect(prompts).toHaveLength(1);

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('a-harbour-at-dusk.png');

  // Editing the caption regenerates: a second txt2img call with the new prompt.
  const caption = page.getByRole('figure').locator('figcaption');
  // Keyboard path: Enter opens the editor, Escape closes it without a new render.
  await caption.focus();
  await page.keyboard.press('Enter');
  await expect(caption).toHaveAttribute('contenteditable', 'true');
  await caption.fill('a harbour at noon');
  await page.keyboard.press('Escape');
  await expect(caption).toHaveText('a harbour at dusk');
  expect(prompts).toHaveLength(1);

  await caption.dblclick();
  await caption.fill('a harbour at dawn');
  await page.getByRole('figure').click({ position: { x: 1, y: 1 } });
  // The caption changes on the spot; the picture follows when the server answers.
  await expect.poll(() => prompts.map((p) => p.split(',')[0])).toEqual(['a harbour at dusk', 'a harbour at dawn']);
  await expect(page.getByRole('img', { name: 'a harbour at dawn' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('figure')).toBeHidden();
});

test('a brief naming a character sends their looks, tags the image and shows it in their drawer', async ({ page }) => {
  const prompts: string[] = [];
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    // Portraits render between turns too; only the See call matters here.
    if (!prompt.startsWith('portrait')) prompts.push(prompt);
    return route.fulfill({ json: { images: [PNG] } });
  });
  const tamsin = { id: 'ent_tamsin', name: 'Tamsin', description: 'Tamsin is a ferrywoman.', appearance: 'grey braid, patched cloak' };
  await openSeededAdventure(page, 3, `${IMAGES}/`, { entities: [tamsin] });

  await see(page, 'Tamsin at the ferry');
  await expect(page.getByRole('img', { name: 'Tamsin at the ferry' })).toBeVisible();
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('a ferrywoman, grey braid, patched cloak at the ferry');
  expect(prompts[0]).not.toContain('Tamsin');

  const figure = page.getByRole('figure');
  await figure.getByText('Prompt', { exact: true }).click();
  await expect(figure.getByRole('textbox', { name: 'Image prompt' })).toHaveValue(prompts[0] ?? '');
  await figure.getByRole('button', { name: 'Open Tamsin' }).click();
  const drawer = page.getByRole('dialog', { name: 'Tamsin' });
  await drawer.getByRole('button', { name: /^Show image \d+: Tamsin at the ferry$/ }).click();
  await expect(drawer).toBeHidden();
  await expect(figure).toBeInViewport();
});

test('a model-card preset sends its sampler and runs the hires pass', async ({ page }) => {
  const bodies: { path: string; body: Record<string, unknown> }[] = [];
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path === '/sdapi/v1/samplers') return route.fulfill({ json: [{ name: 'Euler a' }, { name: 'DPM++ 2M Karras' }] });
    if (path !== '/sdapi/v1/txt2img' && path !== '/sdapi/v1/img2img') return route.fulfill({ status: 404, json: {} });
    bodies.push({ path, body: route.request().postDataJSON() as Record<string, unknown> });
    return route.fulfill({ json: { images: [PNG] } });
  });

  await openAdventure(page);
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();
  const sampler = page.getByRole('combobox', { name: 'Sampler' });
  // "Server default" plus the two the server lists.
  await expect(sampler.locator('option')).toHaveCount(3);
  // One checkpoint loaded (KoboldCpp's --sdmodel): nothing to switch to, so no field.
  await expect(page.getByLabel('Checkpoint')).toBeHidden();
  await page.getByRole('combobox', { name: 'Apply preset' }).last().selectOption({ label: 'Realistic' });
  await expect(sampler).toHaveValue('DPM++ 2M Karras');

  await see(page, 'a harbour at dusk');
  await expect(page.getByRole('img', { name: 'a harbour at dusk' })).toBeVisible();
  expect(bodies.map((b) => b.path)).toEqual(['/sdapi/v1/txt2img', '/sdapi/v1/img2img']);
  expect(bodies[0]?.body).toMatchObject({ sampler_name: 'DPM++ 2M Karras', clip_skip: 2, width: 512 });
  expect(bodies[1]?.body).toMatchObject({ sampler_name: 'DPM++ 2M Karras', width: 768, height: 768, denoising_strength: 0.55 });
});

test('a failed render, and one a reload abandoned, both offer Retry', async ({ page }) => {
  let calls = 0;
  let fail = true;
  let hang = false;
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    calls += 1;
    if (hang) return new Promise(() => undefined); // never answers: the reload abandons it
    if (fail) return route.fulfill({ status: 500, body: 'no model loaded' });
    return route.fulfill({ json: { images: [PNG] } });
  });

  await openAdventure(page);
  await see(page, 'a harbour at dusk');

  const figure = page.getByRole('figure');
  await expect(figure).toContainText('Could not generate this image');
  // The prompt survives the failure, so Retry has something to send.
  await expect(figure).toContainText('a harbour at dusk');
  // The toast says why; it sits over the command row, so it goes before the next turn.
  await expect(page.getByRole('alert')).toContainText('Could not generate the image');
  // Errors never auto-dismiss, unlike info toasts.
  await page.waitForTimeout(6000);
  await expect(page.getByRole('alert')).toContainText('Could not generate the image');
  await page.getByRole('button', { name: 'dismiss' }).click();

  fail = false;
  await figure.getByRole('button', { name: 'Retry' }).first().click();
  await expect(page.getByRole('img', { name: 'a harbour at dusk' })).toBeVisible();
  expect(calls).toBe(2);

  // A render the reload killed: no job is left behind it, so the block must not claim it is still generating.
  hang = true;
  await see(page, 'a lantern');
  await expect(page.getByText('Generating…')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Generating…/)).toBeHidden();
  await expect(page.locator('figure', { hasText: 'a lantern' })).toContainText('Could not generate this image');
});

test('a server that reports progress shows a bar, the step and the time left', async ({ page }) => {
  let step = 0;
  let release = () => {};
  await page.route(`${IMAGES}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/sdapi/v1/sd-models') return route.fulfill({ json: [{ title: 'sd_xl_base.safetensors [31e35c80fc]', model_name: 'sd_xl_base' }] });
    // Advances one step per poll, so the second reading already gives a rate.
    if (path === '/sdapi/v1/progress') return route.fulfill({ json: { progress: step / 40, state: { sampling_step: ++step, sampling_steps: 40 } } });
    if (path !== '/sdapi/v1/txt2img') return route.fulfill({ status: 404, json: {} });
    await new Promise<void>((done) => (release = done));
    return route.fulfill({ json: { images: [PNG] } });
  });

  await openAdventure(page);
  await see(page, 'a lighthouse');
  const figure = page.locator('figure', { hasText: 'a lighthouse' });
  await expect(figure.getByRole('progressbar', { name: 'Image progress' })).toBeVisible();
  await expect(figure).toContainText(/step \d+\/40 · ~\d+ s left/);
  release();
  await expect(page.getByRole('img', { name: 'a lighthouse' })).toBeVisible();
  await expect(figure.getByRole('progressbar')).toBeHidden();
});
