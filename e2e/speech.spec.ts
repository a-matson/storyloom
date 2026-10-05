import { expect, test, type Page } from '@playwright/test';

interface Spoken {
  text: string;
  voice: string | undefined;
  cancelled: boolean;
}

// Headless Chromium ships no speech service, so there is nothing to observe but a stub. It reports
// through exposed bindings rather than a window array: the record then survives a navigation.
const STUB = () => {
  const report = window as unknown as { __spoke: (s: { text: string; voice?: string }) => void; __cancelled: () => void };
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
        report.__spoke({ text: u.text, ...(u.voice ? { voice: u.voice.voiceURI } : {}) });
      },
      cancel: () => {
        if (current) report.__cancelled();
        current = undefined;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
};

/** Installs the stub and returns the list it fills, in Node. */
async function stubSpeech(page: Page): Promise<Spoken[]> {
  const spoken: Spoken[] = [];
  await page.exposeFunction('__spoke', (s: { text: string; voice?: string }) => {
    spoken.push({ text: s.text, voice: s.voice, cancelled: false });
  });
  await page.exposeFunction('__cancelled', () => {
    const last = spoken.at(-1);
    if (last) last.cancelled = true;
  });
  await page.addInitScript(STUB);
  return spoken;
}

test('read aloud speaks a finished turn in the chosen voice, and Stop cancels it', async ({ page }) => {
  const spoken = await stubSpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Demo \(no GPU\)/ }).click();
  await page.getByRole('switch', { name: 'Read aloud' }).click();
  await page.getByRole('combobox', { name: 'Voice' }).selectOption('stub://narrator');
  // The demo backend only answers once it has been tested; without it there is no turn to read.
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  // The opening was already on screen when the adventure loaded: it is not read aloud.
  expect(spoken).toEqual([]);

  await page.getByRole('textbox', { name: 'Take a turn' }).fill('I open the door');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect.poll(() => spoken.length).toBe(1);
  const first = spoken[0];
  expect(first?.voice).toBe('stub://narrator');
  expect(first?.text).not.toBe('');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Speak' })).toBeVisible();
  expect(first?.cancelled).toBe(true);

  // Speak reads the same output again, on demand.
  await page.getByRole('button', { name: 'Speak' }).click();
  await expect.poll(() => spoken.length).toBe(2);
  expect(spoken[1]?.text).toBe(first?.text);
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
