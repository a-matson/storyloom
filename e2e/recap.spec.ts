import { expect, test } from '@playwright/test';
import { openSeededAdventure } from './seed';

test('reopening after 12 h shows "Previously on" until the first turn', async ({ page }) => {
  await page.clock.install();
  await openSeededAdventure(page, 3, undefined, { scene: { present: ['Merav'] } });
  const recap = page.getByRole('note', { name: 'Previously on' });
  await expect(page.locator('#story [data-action-id]')).toHaveCount(3);
  await expect(recap).toBeHidden();

  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.clock.fastForward('13:00:00');
  await page.getByRole('button', { name: 'Continue Salt Road 3 actions' }).click();
  await expect(recap).toContainText('With you: Merav.');

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(recap).toBeHidden();
});
