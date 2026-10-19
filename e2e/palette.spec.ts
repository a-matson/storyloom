import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { COMMANDS, MODE_IDS, MODES } from '../src/ui/features/game/modes';
import { openSeededAdventure } from './seed';

test('Ctrl+K lists every command and mode, inserts a command, opens a section', async ({ page }) => {
  await openSeededAdventure(page, 3);
  await expect(page.getByRole('textbox', { name: 'Take a turn' })).toBeFocused();
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const options = palette.getByRole('option');
  for (const c of COMMANDS) await expect(options.filter({ hasText: `/${c}` }).first()).toBeVisible();
  for (const m of MODE_IDS) await expect(options.filter({ hasText: `${MODES[m].label} mode` })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(violations).toEqual([]);

  // Arrows and Enter: the first match of "wai" is /wait, inserted rather than run.
  await page.keyboard.type('wai');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Take a turn' })).toHaveValue('/wait ');
  await expect(page.getByRole('textbox', { name: 'Take a turn' })).toBeFocused();

  await page.keyboard.press('Control+K');
  await page.keyboard.type('rules');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Adventure settings' }).getByRole('button', { name: /^Rules/ })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Control+K');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});
