import { expect, test, type Page } from '@playwright/test';

async function connectDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

const OUTPUT_SCRIPT = `const modifier = (text) => { log('hi'); state.visited = true; return { text: text + '!' } }; modifier(text)`;

async function newScenario(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You stand in the market of Corrow.');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Scripts' }).click();
}

test('the Script test panel runs a hook against sample input', async ({ page }) => {
  await connectDemo(page);
  await newScenario(page, 'Tested Market');

  // Library has no hook of its own.
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();

  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('textbox', { name: 'Output' }).fill(OUTPUT_SCRIPT);
  await page.getByRole('textbox', { name: 'Sample input' }).fill('Hello');
  await page.getByRole('button', { name: 'Run' }).click();

  const result = page.getByLabel('Test result');
  await expect(result.getByText('Hello!')).toBeVisible();
  await expect(result.getByText('hi', { exact: true })).toBeVisible();
  await expect(result.getByText(/"visited": true/)).toBeVisible();
  await expect(page.getByLabel('Console log').getByText(/\[onOutput .*\] hi/)).toBeVisible();

  // Each tab keeps its own script.
  await page.getByRole('button', { name: 'Input', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Input', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Output', exact: true })).toHaveValue(OUTPUT_SCRIPT);

  // Invalid sample state is reported and nothing runs.
  await page.getByRole('textbox', { name: 'Sample state (JSON)' }).fill('{nope}');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText(/Sample state:/)).toBeVisible();
});

test('Inspect shows the script state of a played adventure', async ({ page }) => {
  await connectDemo(page);
  await newScenario(page, 'Inspected Market');
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('textbox', { name: 'Output' }).fill(OUTPUT_SCRIPT);
  await page.getByRole('button', { name: 'Play test' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('look around');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/% cached/)).toBeVisible();

  await page.getByRole('button', { name: 'View context' }).last().click();
  const drawer = page.getByRole('dialog', { name: 'Context sent to the model' });
  await drawer.getByRole('button', { name: 'Inspect' }).click();
  await expect(drawer.getByText(/"visited": true/)).toBeVisible();
  await expect(drawer.getByText(/onOutput: hi/)).toBeVisible();
});
