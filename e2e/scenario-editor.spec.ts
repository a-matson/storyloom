import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('create, edit, save and reopen a scenario', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: '+ New scenario' }).click();
  await expect(page).toHaveURL(/#\/scenario\//);
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();

  await page.getByRole('textbox', { name: 'Prompt' }).fill('You are ${character.name}, alone on the night ferry.');
  await expect(page.getByText('unsaved changes')).toBeVisible();
  const rail = page.getByRole('complementary', { name: 'Scenario overview' });
  await expect(rail.getByText('${character.name}')).toBeVisible();
  await expect(rail.getByText("Enter your character's name…")).toBeVisible();

  await rail.getByRole('button', { name: '+ New' }).click();
  await page.locator('#card-name').fill('Ferryman');
  await page.locator('#card-entry').fill('The ferryman never looks up from his rope.');
  await page.locator('#card-triggers').fill('ferryman, rope');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(rail.getByRole('button', { name: 'Edit story card Ferryman' })).toBeVisible();
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Night Ferry');
  await page.getByRole('textbox', { name: 'Tags' }).fill('mystery, sea');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.reload();
  await page.getByRole('button', { name: 'Basics' }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Night Ferry');
  await expect(page.getByRole('textbox', { name: 'Tags' })).toHaveValue('mystery, sea');
  await page.getByRole('button', { name: 'Technical' }).click();
  await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue('You are ${character.name}, alone on the night ferry.');
  await expect(page.getByRole('button', { name: 'Edit story card Ferryman' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'Night Ferry' }).click();
  await expect(page).toHaveURL(/#\/scenario\//);
});
