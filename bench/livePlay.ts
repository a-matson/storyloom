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
