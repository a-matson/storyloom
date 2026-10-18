import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

// 1x1 PNG that `createImageBitmap` decodes.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IWcDAALUASNyYth2AAAAAElFTkSuQmCC';

test('each round draws a sheet of the stated looks, without the name', async ({ page }) => {
  const images = 'http://localhost:7999';
  const sheets: string[] = [];
  await page.route(`${images}/**`, async (route) => {
    if (new URL(route.request().url()).pathname !== '/sdapi/v1/txt2img') return route.fulfill({ json: [] });
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    if (prompt.startsWith('character reference sheet')) sheets.push(prompt);
    return route.fulfill({ json: { images: [PNG] } });
  });
  await openSeededAdventure(page, 3, `${images}/`);
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await page.getByRole('dialog', { name: 'Merav' }).getByRole('button', { name: 'Build character' }).click();
  const builder = page.getByRole('dialog', { name: 'Build Merav' });

  await builder.getByRole('button', { name: 'Ask about hair: missing' }).click();
  await builder.getByRole('textbox', { name: 'Hair colour and style?' }).fill('white mohawk');
  await builder.getByRole('button', { name: 'Next round' }).click();
  await expect(builder.getByRole('img', { name: 'Character sheet' })).toHaveAttribute('src', /^blob:/);
  expect(sheets).toHaveLength(1);
  expect(sheets[0]).toContain('white mohawk');
  expect(sheets[0]).not.toContain('Merav');

  await expect(builder.getByRole('button', { name: 'Draw again' })).toBeHidden();
  await builder.getByRole('textbox', { name: 'What are they? (human, fox, elf…)' }).fill('fox');
  await builder.getByRole('textbox', { name: 'What are they? (human, fox, elf…)' }).blur();
  await builder.getByRole('button', { name: 'Draw again' }).click();
  await expect.poll(() => sheets.length).toBe(2);
  await expect(builder.getByRole('button', { name: 'Draw again' })).toBeHidden();
});

test('the character builder asks a round of looks and keeps the answers', async ({ page }) => {
  await openSeededAdventure(page, 3);
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await page.getByRole('dialog', { name: 'Merav' }).getByRole('button', { name: 'Build character' }).click();
  const builder = page.getByRole('dialog', { name: 'Build Merav' });

  await builder.getByRole('textbox', { name: 'What are they? (human, fox, elf…)' }).fill('fox');
  await builder.getByRole('textbox', { name: 'How tall and how built are they?' }).fill('tall and wiry');
  await builder.getByRole('textbox', { name: 'What colour is their skin, fur or hide?' }).fill('red fur');
  await builder.getByRole('button', { name: 'Next round' }).click();
  await builder.getByRole('button', { name: 'Skip eyes' }).click();
  // A fox is not human: its body plan is asked with the required keys.
  await builder.getByRole('button', { name: 'Skip body' }).click();
  for (const k of ['species', 'build', 'skin']) await expect(builder.getByRole('button', { name: `Ask about ${k}: answered` })).toBeVisible();
  await expect(builder.getByRole('button', { name: 'Ask about eyes: skipped' })).toBeVisible();
  await expect(builder.getByRole('button', { name: 'Done' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(builder).toBeHidden();
  const drawer = page.getByRole('dialog', { name: 'Merav' });
  await expect(drawer.getByText('skin: red fur')).toBeVisible();
  await drawer.getByRole('button', { name: 'Build character' }).click();
  await expect(builder.getByRole('button', { name: 'Ask about skin: answered' })).toBeVisible();
  await expect(builder.getByRole('button', { name: 'Ask about eyes: skipped' })).toBeVisible();

  await builder.getByRole('textbox', { name: 'Hair colour and style?' }).fill('white mohawk, her pride and joy');
  await builder.getByRole('button', { name: 'Next round' }).click();
  // The answer is kept as its tags, shown as chips before Done.
  await expect(builder.getByRole('list', { name: 'Looks' }).getByText('hair: white mohawk')).toBeVisible();
  await expect(builder.getByText(/her pride/)).toBeHidden();
  await builder.getByRole('textbox', { name: 'What stands out about their face?' }).fill('a long muzzle');
  await builder.getByRole('textbox', { name: 'What are they wearing?' }).fill('a blue cloak');
  await builder.getByRole('textbox', { name: 'What are they wearing?' }).blur();
  await expect(builder.getByRole('button', { name: 'Done' })).toBeEnabled();
  await builder.getByRole('button', { name: 'Done' }).click();
  await expect(builder).toBeHidden();
  await expect(drawer.getByText('wearing: a blue cloak')).toBeVisible();
});

test('Done draws the final sheet with hires and a portrait, and both survive a reload', async ({ page }) => {
  const images = 'http://localhost:7999';
  const calls: { path: string; prompt: string }[] = [];
  await page.route(`${images}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('2img')) return route.fulfill({ json: [] });
    calls.push({ path, prompt: (route.request().postDataJSON() as { prompt: string }).prompt });
    return route.fulfill({ json: { images: [PNG] } });
  });
  await openSeededAdventure(page, 3, `${images}/`);
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  const drawer = page.getByRole('dialog', { name: 'Merav' });
  await drawer.getByRole('button', { name: 'Build character' }).click();
  const builder = page.getByRole('dialog', { name: 'Build Merav' });
  for (const k of ['hair', 'face', 'wearing', 'eyes']) await builder.getByRole('button', { name: `Ask about ${k}: missing` }).click();
  await builder.getByRole('button', { name: 'Skip eyes' }).click();
  const answers: [string, string][] = [
    ['What are they? (human, fox, elf…)', 'fox'],
    ['How tall and how built are they?', 'tall and wiry'],
    ['What colour is their skin, fur or hide?', 'red fur'],
    ['Hair colour and style?', 'white mohawk'],
    ['What stands out about their face?', 'a long muzzle'],
    ['What are they wearing?', 'a blue cloak'],
  ];
  for (const [q, a] of answers) await builder.getByRole('textbox', { name: q }).fill(a);
  await builder.getByRole('textbox', { name: 'What are they wearing?' }).blur();
  await builder.getByRole('button', { name: 'Done' }).click();
  await expect(builder).toBeHidden();
  // The hires pass is the img2img call after the sheet's txt2img.
  const sheet = (path: string) => calls.some((c) => c.path === path && c.prompt.startsWith('character reference sheet'));
  expect(sheet('/sdapi/v1/txt2img') && sheet('/sdapi/v1/img2img')).toBe(true);
  expect(calls.some((c) => c.prompt.startsWith('portrait'))).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.getByRole('button', { name: 'Open Merav' }).click();
  await expect(drawer.getByRole('img', { name: 'Character sheet' })).toHaveAttribute('src', /^blob:/);
  await expect(drawer.getByRole('button', { name: 'Redraw' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Rebuild' })).toBeVisible();
});

test('the builder says sheets need SDXL until the image size is an SDXL one', async ({ page }) => {
  await openSeededAdventure(page, 3, 'http://localhost:7999/');
  const note = page.getByText('Sheets need an SDXL model');
  const openBuilder = async () => {
    await page.getByRole('button', { name: /^Characters/ }).click();
    await page.getByRole('button', { name: 'Open Merav' }).click();
    await page.getByRole('dialog', { name: 'Merav' }).getByRole('button', { name: 'Build character' }).click();
  };
  await openBuilder();
  await expect(note).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Images', { exact: true }).click();
  for (const name of ['Width', 'Height']) {
    await page.getByRole('spinbutton', { name }).fill('1024');
    await page.getByRole('spinbutton', { name }).blur();
  }
  await page.getByRole('tab', { name: 'Adventure' }).click();
  await openBuilder();
  await expect(page.getByRole('dialog', { name: 'Build Merav' })).toBeVisible();
  await expect(note).toHaveCount(0);
});
