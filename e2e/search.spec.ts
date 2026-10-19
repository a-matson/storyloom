import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('/ focuses story search and Enter jumps to the best hit', async ({ page }) => {
  await openSeededAdventure(page, 40, undefined, { opening: 'A lantern swings over the old gate.' });
  await expect(page.locator('#story [data-action-id]')).toHaveCount(40);

  await page.locator('#story').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('/');
  const search = page.getByRole('searchbox', { name: 'Search the story' });
  await expect(search).toBeFocused();

  await search.fill('lantern');
  await expect(page.getByRole('region', { name: 'Story' }).getByRole('button')).toHaveText(['A lantern swings over the old gate.']);
  await search.press('Enter');
  await expect(page.locator('#story [data-action-id]').first()).toBeInViewport();

  // The turn input keeps `/` for its slash commands.
  const turn = page.getByRole('textbox', { name: 'Take a turn' });
  await turn.click();
  await page.keyboard.press('/');
  await expect(turn).toHaveValue('/');
});
