import type { Page } from '@playwright/test';

/** The live scenario's player turns, shared by `measure live` and `measure repetition`. */
export const TURNS: [mode: 'Do' | 'Say', text: string][] = [
  ['Do', 'look around'],
  ['Do', 'walk to the nearest door'],
  ['Do', 'ask the ferrywoman Tamsin about the road ahead'],
  ['Say', 'What happened to the last traveller who came this way?'],
  ['Do', 'pay Tamsin a silver coin and step onto the ferry'],
  ['Do', 'watch the far bank as the ferry crosses'],
  ['Do', 'climb the bank and follow the path into the woods'],
  ['Do', 'search the abandoned camp by the path'],
  ['Do', 'read the letter found in the camp'],
  ['Say', 'Is anyone out there? Show yourself.'],
  ['Do', 'draw my sword and wait'],
  ['Do', 'follow the tracks deeper into the woods'],
  ['Do', 'climb a tree to look over the canopy'],
  ['Do', 'head toward the smoke on the horizon'],
  ['Do', 'approach the village gate carefully'],
  ['Say', 'I come in peace. I am looking for shelter.'],
  ['Do', 'follow the guard to the inn'],
  ['Do', 'ask the innkeeper about the ferrywoman'],
  ['Do', 'go upstairs and rest for the night'],
  ['Do', 'wake at dawn and check my pack'],
];

/** Commands typed before the turn of that index: the player's clock set, then moved at three points (M21-2 bar). */
export const CLOCK: Partial<Record<number, string>> = { 0: '/time afternoon, day 1', 6: '/wait 4 hours', 11: '/wait until morning', 18: '/wait until night' };

/** `MEASURE_TURNS=<n>` (default 20): the scenario's turns, from the start again past the end. */
export const playTurns = () =>
  Array.from({ length: Number(process.env['MEASURE_TURNS'] ?? TURNS.length) }, (_, i) => TURNS[i % TURNS.length]).filter((t) => t !== undefined);

/** `MEASURE_EVERY="/complicate:4"`: that command, typed before every 4th turn after the first (M26-3). */
export function everyCommand(turn: number): string | undefined {
  const [command, every] = process.env['MEASURE_EVERY']?.split(':') ?? [];
  return command && turn > 0 && turn % Number(every ?? 1) === 0 ? command : undefined;
}

/** `MEASURE_DIRECTOR=<n>` sets the director to every n player turns before turn 1 (M26-4); n is one the select offers. */
export async function applyDirector(page: Page): Promise<void> {
  const every = process.env['MEASURE_DIRECTOR'];
  if (!every) return;
  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Director', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Director turns' }).selectOption(every);
  await page.getByRole('button', { name: 'Close settings' }).click();
}

/** `MEASURE_PRESET=sliceOfLife|adventure` picks that memory preset before the first turn (M24-4); an unknown id fails the run. */
export async function applyPreset(page: Page): Promise<void> {
  const id = process.env['MEASURE_PRESET'];
  if (!id) return;
  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByRole('combobox', { name: 'Memory preset' }).selectOption(id);
  await page.getByRole('button', { name: 'Close settings' }).click();
}

/** Every row of the stores a live run reads; the app has one adventure. */
export function readDb(page: Page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const all = (store: string) =>
      new Promise<Record<string, unknown>[]>((ok, fail) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.addEventListener('success', () => ok(r.result as Record<string, unknown>[]));
        r.addEventListener('error', () => fail(r.error));
      });
    const out = {
      adventures: await all('adventures'),
      actions: await all('actions'),
      memories: await all('memories'),
      entities: await all('entities'),
      assertions: await all('assertions'),
      traces: await all('traces'),
      cards: await all('storyCards'),
    };
    db.close();
    return out;
  });
}
