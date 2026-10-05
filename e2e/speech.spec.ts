import { expect, test, type Page } from '@playwright/test';

// Headless Chromium ships no speech service, so there is nothing to observe but a stub.
// It records what the app asked for and fires `onend` only when the app lets it finish.
const STUB = () => {
  const spoken: { text: string; voice: string | undefined; cancelled: boolean }[] = [];
  Object.defineProperty(window, '__spoken', { value: spoken });
  class Utterance extends EventTarget {
    rate = 1;
    voice: SpeechSynthesisVoice | null = null;
    text: string;
    constructor(text: string) {
      super();
      this.text = text;
    }
  }
  let current: Utterance | undefined;
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance });
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: () => [{ voiceURI: 'stub://narrator', name: 'Narrator', lang: navigator.language }],
      speak: (u: Utterance) => {
        current = u;
        spoken.push({ text: u.text, voice: u.voice?.voiceURI, cancelled: false });
      },
      cancel: () => {
        const last = spoken.at(-1);
        if (current && last) last.cancelled = true;
        current = undefined;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
};

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: { text: string; voice?: string; cancelled: boolean }[] }).__spoken);

test('read aloud speaks a finished turn in the chosen voice, and Stop cancels it', async ({ page }) => {
  await page.addInitScript(STUB);
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Read aloud' }).click();
  await page.getByRole('combobox', { name: 'Voice' }).selectOption('stub://narrator');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  // The opening was already on screen when the adventure loaded: it is not read aloud.
  expect(await spoken(page)).toEqual([]);

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('I open the door');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  const [first] = await spoken(page);
  expect(first?.voice).toBe('stub://narrator');
  expect(first?.text).not.toBe('');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Speak' })).toBeVisible();
  expect((await spoken(page))[0]?.cancelled).toBe(true);

  // Speak reads the same output again, on demand.
  await page.getByRole('button', { name: 'Speak' }).click();
  await expect.poll(async () => (await spoken(page)).length).toBe(2);
  expect((await spoken(page))[1]?.text).toBe(first?.text);
});

test('the voice picker stays hidden when the browser has no speech service', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Read aloud' })).toBeHidden();
});
