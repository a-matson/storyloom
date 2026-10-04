import { expect, test, type Page } from '@playwright/test';

async function connectDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

const OUTPUT_SCRIPT = `const modifier = (text) => {
  log('shouted ' + text.length + ' chars');
  return { text: text.toUpperCase() };
};
modifier(text);`;

const CONTEXT_SCRIPT = `const modifier = (text) => {
  log('saw ' + sections.length + ' sections');
  return { text: text + '\\n[Rule: the air tastes of iron.]' };
};
modifier(text);`;

test('a Context script that rewrites the prompt is flagged as uncached', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You stand in the market of Corrow.');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Iron Market');
  await page.getByRole('button', { name: 'Scripts' }).click();
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.getByRole('textbox', { name: 'Context', exact: true }).fill(CONTEXT_SCRIPT);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  await page.getByRole('button', { name: 'Play Iron Market' }).click();
  await page.getByRole('dialog', { name: 'Iron Market' }).getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill('haggle for a lamp');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('uncached: script')).toBeVisible();

  // The rewritten body is what was sent, and the script really saw the sections.
  await page.getByRole('button', { name: 'View context' }).last().click();
  const context = page.getByRole('dialog', { name: 'Context sent to the model' });
  await context.getByRole('button', { name: 'Raw prompt' }).click();
  await expect(context.getByText('[Rule: the air tastes of iron.]')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Trace' }).last().click();
  const trace = page.getByRole('dialog', { name: 'Turn trace' });
  await expect(trace.getByText('uncached: script')).toBeVisible();
  await expect(trace.getByText(/onModelContext: saw \d+ sections/)).toBeVisible();
});

test('an Output script rewrites the model output and its logs reach the trace', async ({ page }) => {
  await connectDemo(page);
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByRole('textbox', { name: 'Prompt' }).fill('You stand in the market of Corrow.');
  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Shouting Market');
  await page.getByRole('button', { name: 'Scripts' }).click();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('textbox', { name: 'Output', exact: true }).fill(OUTPUT_SCRIPT);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Scenario · Story · saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();

  await page.getByRole('button', { name: 'Play Shouting Market' }).click();
  await page.getByRole('dialog', { name: 'Shouting Market' }).getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('shout at the camel');
  await page.getByRole('button', { name: 'Send' }).click();
  // The demo backend's reply, upper-cased by the sandboxed script.
  await expect(page.getByText('HAND STOPS MOVING.')).toBeVisible();

  await page.getByRole('button', { name: 'Trace' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Turn trace' });
  await expect(dialog.getByText(/onOutput: shouted \d+ chars/)).toBeVisible();
});
