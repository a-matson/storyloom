import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('a face in the story is exactly the 32 px avatar, with no UA border or padding round it', async ({ page }) => {
  await openSeededAdventure(page, 3, undefined, { opening: 'The well is dry.\n\nMerav unrolls the map.' });
  const face = page.locator('#story').getByRole('button', { name: 'Open Merav' });
  expect(await face.boundingBox()).toMatchObject({ width: 32, height: 32 });
});
