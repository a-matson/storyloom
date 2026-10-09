import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod/mini';
import type { Entity } from '@core/model';
import * as S from '@core/schema';
import { OUT_DIR, writeMeasurement } from '../../bench/env';
import { watchIntroductions } from './introductions';

// `pnpm measure live <url>`: plays the real app against a real llama-server; never runs in CI.
const URL = process.env['MEASURE_URL'];
// Optional second server for memories/summaries/cards (`MEASURE_UTILITY=http://localhost:8081`).
const UTILITY = process.env['MEASURE_UTILITY'];
// Optional A1111 server; portraits are then drawn between turns (`MEASURE_IMAGES=http://localhost:7860`).
const IMAGES = process.env['MEASURE_IMAGES'];
test.skip(!URL, 'needs MEASURE_URL (a running llama-server)');

// A player reads the output before typing; idle memory jobs run in this gap. [provisional]
const READ_MS = Number(process.env['MEASURE_READ_MS'] ?? 6000);
// Then types key by key, so typing-aware deferral of memory jobs is exercised. [provisional]
const TYPE_MS = 4000;
const TURN_MS = 180_000;

const TURNS: [mode: 'Do' | 'Say', text: string][] = [
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

const send = (page: Page) => page.getByRole('button', { name: 'Send' });

async function generated(page: Page, start: () => Promise<void>): Promise<void> {
  await start();
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await expect(send(page)).toBeVisible({ timeout: TURN_MS });
  await page.waitForTimeout(READ_MS);
}

async function addCards(page: Page): Promise<void> {
  // The sidebar starts open on wide screens; the header button toggles it.
  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByRole('button', { name: /^Story cards/ }).click();
  await page.getByRole('button', { name: '+ New' }).click();
  await page.locator('#card-name').fill('Tamsin');
  await page.locator('#card-entry').fill('Tamsin is the ferrywoman at the river crossing. She is half-deaf, trades in rumours and fears the woods.');
  await page.locator('#card-triggers').fill('tamsin,ferrywoman');
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByRole('button', { name: 'Generate new' }).first().click();
  await expect(page.getByRole('button', { name: 'Generating…' })).toBeHidden({ timeout: TURN_MS });
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
}

async function editLast(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const p = page.locator('[contenteditable="true"]');
  await p.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' A cold wind rises.');
  await page.getByRole('textbox', { name: 'Take a turn' }).click();
  await expect(page.getByText('A cold wind rises.')).toBeVisible();
}

async function eraseUndoRedo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Erase to here' }).click();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.getByRole('button', { name: 'Redo' }).first().click();
}

/** Every row of the stores this run reads; the app has one adventure. */
function readDb(page: Page) {
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
      traces: await all('traces'),
      cards: await all('storyCards'),
    };
    db.close();
    return out;
  });
}

/** Memory jobs run on idle; wait until the bank and summary stop changing. */
async function settledDb(page: Page) {
  let prev = '';
  for (let i = 0; i < 18; i++) {
    const db = await readDb(page);
    const key = JSON.stringify([db.memories, db.entities, db.adventures]);
    if (key === prev) return db;
    prev = key;
    await page.waitForTimeout(10_000);
  }
  return readDb(page);
}

/** What landed in IndexedDB for each portrait, decoded the way the app shows it; plus a Characters tab screenshot. */
async function portraits(page: Page, entities: Entity[]) {
  const ids = entities.flatMap((e) => (e.portraitId === undefined ? [] : [{ name: e.name, id: e.portraitId }]));
  const sizes = await page.evaluate(async (wanted) => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const rows = await new Promise<{ id: string; blob: Blob }[]>((ok, fail) => {
      const r = db.transaction('images').objectStore('images').getAll();
      r.addEventListener('success', () => ok(r.result as { id: string; blob: Blob }[]));
      r.addEventListener('error', () => fail(r.error));
    });
    db.close();
    return Promise.all(
      wanted.map(async ({ name, id }) => {
        const blob = rows.find((r) => r.id === id)?.blob;
        if (!blob) return { name, stored: false };
        const bitmap = await createImageBitmap(blob);
        return { name, stored: true, type: blob.type, bytes: blob.size, width: bitmap.width, height: bitmap.height };
      }),
    );
  }, ids);
  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByRole('button', { name: /^Characters/ }).click();
  await page.screenshot({ path: `${OUT_DIR}/${new Date().toISOString().slice(0, 10)}-portraits.png` });
  return sizes;
}

test('scripted live play', async ({ page }) => {
  test.setTimeout(60 * 60_000);
  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  if (UTILITY) {
    await page.getByRole('switch', { name: 'Use a utility model' }).click();
    await page.getByRole('textbox', { name: 'Utility server URL' }).fill(UTILITY);
  }
  if (IMAGES) {
    await page.getByRole('switch', { name: 'Use an image server' }).click();
    await page.getByRole('textbox', { name: 'Image server URL' }).fill(IMAGES);
  }
  // A render outlives the DB settling (minutes, and nothing is written until it ends), so the run waits on the requests themselves.
  const renders: { ms?: number; failed?: string }[] = [];
  let rendering = 0;
  const isRender = (r: { url: () => string }) => r.url().endsWith('/sdapi/v1/txt2img');
  page.on('request', (r) => void (isRender(r) && rendering++));
  page.on('requestfinished', (r) => {
    if (!isRender(r)) return;
    renders.push({ ms: Math.round(r.timing().responseEnd) });
    rendering--;
  });
  page.on('requestfailed', (r) => {
    if (!isRender(r)) return;
    renders.push({ failed: r.failure()?.errorText ?? 'failed' });
    rendering--;
  });
  const introductions = await watchIntroductions(page, UTILITY ?? URL ?? '');
  const portraitLog: string[] = [];
  page.on('console', (m) => void (/portrait/i.test(m.text()) && portraitLog.push(m.text())));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  for (const [i, [mode, text]] of TURNS.entries()) {
    introductions.turn = i;
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('textbox', { name: 'Take a turn' }).pressSequentially(text, { delay: TYPE_MS / text.length });
    await generated(page, () => send(page).click());
    if (i === 2) await addCards(page);
    if (i === 5) for (let r = 0; r < 2; r++) await generated(page, () => page.getByRole('button', { name: /^Retry/ }).click());
    if (i === 9) await editLast(page);
    if (i === 14) await eraseUndoRedo(page);
  }

  let db = await settledDb(page);
  if (IMAGES) {
    await expect.poll(() => rendering, { timeout: 2 * TURN_MS, intervals: [5000] }).toBe(0);
    db = await settledDb(page);
  }
  const text = new Map(
    z
      .array(S.Action)
      .parse(db.actions)
      .map((a) => [a.id, a.versions[a.active] ?? '']),
  );
  const traces = z
    .array(S.TurnTrace)
    .parse(db.traces)
    .toSorted((a, b) => a.createdAt - b.createdAt);
  const turns = traces.map(({ kind, outcome, errorKind, stopReason, actionId, timings, overlap, stats: s = {} }) => {
    const out = actionId === undefined ? '' : (text.get(actionId) ?? '');
    const { promptTokens = 0, cachedTokens = 0, generatedTokens = 0, generationMs = 0 } = s;
    return {
      kind,
      outcome,
      // A failed turn is otherwise unexplained in the JSON (one `error` turn in the 2026-10-04 overlap run).
      errorKind,
      stopReason,
      promptTokens: s.promptTokens,
      cacheHit: promptTokens > 0 ? +(cachedTokens / promptTokens).toFixed(3) : undefined,
      promptMs: s.promptMs,
      genMs: s.generationMs,
      tokPerSec: generationMs > 0 ? +((generatedTokens / generationMs) * 1000).toFixed(1) : undefined,
      ttftMs: timings.ttftMs,
      // Which background job held a slot during this turn (Gate V finding 19): the reason a turn is slow.
      overlap,
      tail: out.slice(-80),
      danglingQuote: (out.match(/"/g) ?? []).length % 2 === 1 || (out.match(/“/g) ?? []).length > (out.match(/”/g) ?? []).length,
    };
  });
  const entities = z.array(S.Entity).parse(db.entities);
  const entityIds = new Set(entities.map((e) => e.id));
  // The newest prompt that carried a projected entity: the Raw prompt a prompt-construction PR shows.
  const entityPrompt = traces.findLast((t) => t.triggeredCardIds.some((id) => entityIds.has(id)))?.prompt;
  const stopReasons: Record<string, number> = {};
  for (const t of turns) stopReasons[t.stopReason ?? 'none'] = (stopReasons[t.stopReason ?? 'none'] ?? 0) + 1;
  // A label keeps same-day re-runs from overwriting each other.
  const label = process.env['MEASURE_LABEL'];
  const path = writeMeasurement(label ? `live-play-${label}` : 'live-play', {
    url: URL,
    utility: UTILITY,
    model: traces.at(-1)?.modelId,
    turns,
    stopReasons,
    // Rows keep embeddings as Float32Array; the output does not need them.
    memories: z
      .array(z.omit(S.Memory, { embedding: true }))
      .parse(db.memories)
      .map(({ fromAction, toAction, text: t, stale, forgotten }) => ({ fromAction, toAction, text: t, stale, forgotten })),
    introductions: introductions.calls,
    // Ids, timestamps and portraits are noise here; `firstSeen` checks a card came the turn after its name.
    entities: entities.map(({ id: _i, portraitId: _p, relations: _r, lastSeen: _l, facts, ...e }) => ({
      ...e,
      facts: facts.map((f) => f.text),
    })),
    entityPrompt,
    ...(IMAGES && { images: IMAGES, renders, portraitLog, portraits: await portraits(page, entities) }),
    cards: z
      .array(S.StoryCard)
      .parse(db.cards)
      .map(({ name, entry, triggers }) => ({ name, entry, triggers })),
    storySummary: z.array(z.object({ plot: z.object({ storySummary: z.optional(z.string()) }) })).parse(db.adventures)[0]?.plot.storySummary,
  });
  console.log(`wrote ${path}`);
  expect(turns.length).toBeGreaterThanOrEqual(TURNS.length);
});
