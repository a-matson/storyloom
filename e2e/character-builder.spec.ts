import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

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

  await builder.getByRole('textbox', { name: 'Hair colour and style?' }).fill('white mohawk');
  await builder.getByRole('textbox', { name: 'What stands out about their face?' }).fill('a long muzzle');
  await builder.getByRole('button', { name: 'Next round' }).click();
  await builder.getByRole('textbox', { name: 'What are they wearing?' }).fill('a blue cloak');
  await builder.getByRole('textbox', { name: 'What are they wearing?' }).blur();
  await expect(builder.getByRole('button', { name: 'Done' })).toBeEnabled();
  await builder.getByRole('button', { name: 'Done' }).click();
  await expect(builder).toBeHidden();
  await expect(drawer.getByText('wearing: a blue cloak')).toBeVisible();
});
