import { expect, type Page } from '@playwright/test';
import { z } from 'zod/mini';
import * as S from '@core/schema';

// Same gaps as `play.spec.ts` so memory jobs get their idle slot. [provisional]
const READ_MS = 6000;
// Higher than play.spec.ts's 180 s: at full context a prefill competes with memory jobs on the
// other slot. A 180 s cap lost a run at turn ~93. [measured: 2026-10-06]
const TURN_MS = 300_000;

const send = (page: Page) => page.getByRole('button', { name: 'Send' });
/** Turns whose stream stalled and had to be stopped and re-rolled; reported with the run. */
export const run = { stalls: 0 };

const idle = (page: Page, ms: number) =>
  send(page)
    .waitFor({ state: 'visible', timeout: ms })
    .then(() => true)
    .catch(() => false);

/**
 * One turn. A stream can stall indefinitely on this hardware (headers returned, no tokens;
 * seen twice in a 90-turn run), and the app has no generation timeout of its own, so a stalled
 * turn is stopped and re-rolled rather than losing an hour-long run.
 */
export async function turn(page: Page, mode: 'Do' | 'Say', text: string, readMs = READ_MS): Promise<void> {
  await page.getByRole('button', { name: mode, exact: true }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(text);
  await send(page).click();
  const stop = page.getByRole('button', { name: 'Stop generating' });
  await expect(stop).toBeVisible();
  if (!(await idle(page, TURN_MS))) {
    run.stalls++;
    await stop.click();
    await expect(send(page)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Retry/ }).click();
    await expect(send(page)).toBeVisible({ timeout: TURN_MS });
  }
  await page.waitForTimeout(readMs);
}

/** The adventure the page shows: each replay depth is its own adventure, so every read names one. */
export const shownAdventure = (page: Page) => decodeURIComponent(/#\/adventure\/([^/?]+)/.exec(page.url())?.[1] ?? '');

/** One adventure's rows straight from IndexedDB; memory embeddings are left behind. */
export function readAdventure(page: Page, id: string) {
  return page.evaluate(async (adventureId) => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const ask = <T>(r: IDBRequest) =>
      new Promise<T>((ok, fail) => {
        r.addEventListener('success', () => ok(r.result as T));
        r.addEventListener('error', () => fail(r.error));
      });
    const rows = (store: string) => ask<Record<string, unknown>[]>(db.transaction(store).objectStore(store).index('adventureId').getAll(adventureId));
    const out = {
      adventure: (await ask<Record<string, unknown> | undefined>(db.transaction('adventures').objectStore('adventures').get(adventureId))) ?? {},
      actions: (await rows('actions')).toSorted((a, b) => (a['seq'] as number) - (b['seq'] as number)),
      memories: (await rows('memories')).map(({ embedding: _e, ...m }) => m),
      entities: await rows('entities'),
      traces: await rows('traces'),
    };
    db.close();
    return out;
  }, id);
}
export type Rows = Awaited<ReturnType<typeof readAdventure>>;

/**
 * Undo until the stored log is back to `base` actions. A turn is several undo steps (actions, then
 * stats), so each click waits for the count to drop rather than counting clicks.
 */
export async function rewind(page: Page, id: string, base: number): Promise<void> {
  const count = async () => (await readAdventure(page, id)).actions.length;
  for (let n = await count(), i = 0; n > base; n = await count(), i++) {
    if (i === 8) throw new Error(`undo left ${n} actions, not ${base}`);
    await page.getByRole('button', { name: 'Undo' }).first().click();
    // A stats-only step leaves the count as it was: the loop just clicks again.
    await expect
      .poll(count, { timeout: 5000 })
      .toBeLessThan(n)
      .catch(() => undefined);
  }
}

/** The newest AI output, the prompt that produced it, and the bank and canon facts at that point. */
export function lastTurn(r: Rows) {
  const newest = (xs: Record<string, unknown>[]) => xs.toSorted((a, b) => (a['createdAt'] as number) - (b['createdAt'] as number)).at(-1) ?? {};
  const action = newest(r.actions);
  const trace = newest(r.traces);
  const memories = r.memories as { text: string; forgotten?: boolean; stale?: boolean }[];
  const entities = r.entities as { canon?: boolean; facts?: { text: string }[] }[];
  const versions = (action['versions'] ?? []) as string[];
  return {
    output: versions[(action['active'] ?? 0) as number] ?? '',
    prompt: (trace['prompt'] ?? '') as string,
    model: trace['modelId'] as string | undefined,
    bank: memories.filter((m) => !m.forgotten && !m.stale).map((m) => m.text),
    canonFacts: entities.filter((e) => e.canon).flatMap((e) => (e.facts ?? []).map((f) => f.text)),
  };
}

/** Per-turn cost and the wave-1 state (entities, scene), for the M9 review. */
export function costAndState(r: Rows) {
  const traces = z
    .array(S.TurnTrace)
    .parse(r.traces)
    .toSorted((a, b) => a.createdAt - b.createdAt);
  return {
    turns: traces.map(({ kind, outcome, stats, timings, overlap, sections, entitiesUsed }) => ({
      kind,
      outcome,
      promptTokens: stats?.promptTokens,
      totalMs: timings.totalMs,
      ttftMs: timings.ttftMs,
      overlap,
      sections: Object.fromEntries(sections.map((s) => [s.kind, s.tokens])),
      entitiesUsed: entitiesUsed?.length,
    })),
    entities: z
      .array(S.Entity)
      .parse(r.entities)
      .map(({ kind, name, canon, facts, state }) => ({ kind, name, canon, state, facts: facts.map((f) => (f.conflict ? `CONFLICT ${f.text}` : f.text)) })),
    scene: (r.adventure['plot'] as { scene?: unknown } | undefined)?.scene,
  };
}
