import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function newScenario(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await expect(page).toHaveURL(/#\/scenario\//);
}

test('create, edit, save and reopen a scenario', async ({ page }) => {
  await newScenario(page);
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

test('play test asks each placeholder once, then opens the adventure', async ({ page }) => {
  await newScenario(page);
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You are ${character.name}. You carry ${What do you carry?}. ${character.name} waits.');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Night Ferry');
  await page.getByRole('button', { name: 'Play test' }).click();

  const dialog = page.getByRole('dialog', { name: 'Night Ferry' });
  const name = dialog.getByRole('textbox', { name: "Enter your character's name…" });
  const carry = dialog.getByRole('textbox', { name: 'What do you carry?' });
  const begin = dialog.getByRole('button', { name: 'Begin' });
  await expect(begin).toBeDisabled();
  await name.fill('Merav');
  await carry.fill('   ');
  await expect(begin).toBeDisabled();
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await carry.fill('a brass lantern');
  await carry.press('Enter');

  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText('You are Merav. You carry a brass lantern. Merav waits.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('button', { name: 'Open Night Ferry' })).toBeVisible();
});

test('character creator: pick one card per Type, the AI writes the opening', async ({ page }) => {
  await newScenario(page);
  await page.getByRole('combobox', { name: 'Type' }).selectOption('characterCreator');
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You arrive at the keep.');
  const rail = page.getByRole('complementary', { name: 'Scenario overview' });
  for (const name of ['Mage', 'Rogue']) {
    await rail.getByRole('button', { name: '+ New' }).click();
    await page.locator('#card-type').selectOption('Class');
    await page.getByRole('switch', { name: /Selectable in Character Creator/ }).click();
    await page.locator('#card-name').fill(name);
    await page.locator('#card-entry').fill(`You are a ${name.toLowerCase()}.`);
    await page.locator('#card-triggers').fill(name.toLowerCase());
    await page.locator('#card-notes').fill(`Play as a ${name.toLowerCase()}`);
    await page.getByRole('button', { name: 'Finish' }).click();
  }
  await expect(rail.getByText('pick')).toHaveCount(2);
  await page.getByRole('button', { name: 'Play test' }).click();

  const dialog = page.getByRole('dialog', { name: 'Untitled scenario' });
  const begin = dialog.getByRole('button', { name: 'Begin' });
  await expect(begin).toBeDisabled();
  await dialog.getByRole('radio', { name: /Rogue/ }).check();
  await begin.click();

  await expect(page).toHaveURL(/#\/adventure\//);
  // The demo backend's prose, not the composed prompt.
  await expect(page.getByText(/Merav|Wind pushes salt|pinpricks|"Don't,"/).first()).toBeVisible();
  await expect(page.getByText('You arrive at the keep.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Story cards · 1' }).click();
  await expect(page.getByRole('button', { name: 'Edit story card Rogue' })).toBeVisible();
});

test('multiple choice: edit options, pick the second, its prompt opens the adventure', async ({ page }) => {
  await newScenario(page);
  await page.getByRole('combobox', { name: 'Type' }).selectOption('multipleChoice');
  await page.getByRole('textbox', { name: 'Prompt' }).fill('Which door?');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Doors');
  for (const [title, prompt] of [
    ['Red door', 'The red door is warm.'],
    ['Blue door', 'The blue door is cold.'],
  ] as const) {
    await page.getByRole('button', { name: '+ Add option' }).click();
    await page.getByRole('button', { name: /^Open Option/ }).click();
    await expect(page.getByText('Option of Doors')).toBeVisible();
    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('button', { name: 'Technical' }).click();
    await page.getByRole('textbox', { name: 'Prompt' }).fill(prompt);
    await page.getByRole('button', { name: '← Parent' }).click();
    await page.getByRole('button', { name: 'Basics' }).click();
  }
  await expect(page.getByRole('button', { name: 'Open Blue door' })).toBeVisible();
  await page.getByRole('button', { name: 'Play test' }).click();

  const dialog = page.getByRole('dialog', { name: 'Doors' });
  await expect(dialog.getByText('Which door?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Blue door' }).click();
  await dialog.getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText('The blue door is cold.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('button', { name: 'Open Doors' })).toBeVisible();
});

test('play test without placeholders goes straight to the game', async ({ page }) => {
  await newScenario(page);
  await page.getByRole('textbox', { name: 'Prompt' }).fill('The ferry horn sounds twice.');
  await page.getByRole('button', { name: 'Play test' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await expect(page.getByText('The ferry horn sounds twice.')).toBeVisible();
});
