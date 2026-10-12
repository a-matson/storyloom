import { expect, type Page } from '@playwright/test';
import { z } from 'zod/mini';
import * as S from '@core/schema';
import { Rule } from '@core/schema/rule';
import { appearanceOf, currentStates, LOOK_KEYS } from '@core/memory/looks';

const LOOKS = new Set<string>(LOOK_KEYS);

// Same gaps as `play.spec.ts` so memory jobs get their idle slot. [provisional]
const READ_MS = 6000;
// Higher than play.spec.ts's 180 s: at full context a prefill competes with memory jobs on the
// other slot. A 180 s cap lost a run at turn ~93. [measured: 2026-10-06]
const TURN_MS = 300_000;

const send = (page: Page) => page.getByRole('button', { name: 'Send' });
/** Turns the app's first-token watchdog failed as stalled; reported with the run. */
export const run = { stalls: 0 };

/** One turn. A stalled turn leaves the player action without a reply, so the story is continued once. */
export async function turn(page: Page, mode: 'Do' | 'Say', text: string, readMs = READ_MS): Promise<void> {
  await page.getByRole('button', { name: mode, exact: true }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(text);
  await send(page).click();
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await expect(send(page)).toBeVisible({ timeout: TURN_MS });
  const stalled = page.getByRole('alert').filter({ hasText: 'sent nothing' });
  if (await stalled.isVisible()) {
    run.stalls++;
    await page.getByRole('button', { name: 'Continue' }).click();
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
    repeatedPerTurn: traces.reduce((n, t) => n + (t.repeatedPhrases?.length ?? 0), 0) / (traces.length || 1),
    errors: traces.flatMap((t) => (t.error ? [t.error.message] : [])),
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
      // Looks and state are keyed state facts: dumped apart, so `facts` counts trait facts only.
      .map((e) => ({
        kind: e.kind,
        name: e.name,
        canon: e.canon,
        looks: appearanceOf(e),
        state: Object.fromEntries(Object.entries(currentStates(e)).filter(([k]) => !LOOKS.has(k))),
        facts: e.facts.filter((f) => (f.kind ?? 'trait') === 'trait' || f.conflict).map((f) => (f.conflict ? `CONFLICT ${f.text}` : f.text)),
      })),
    scene: (r.adventure['plot'] as { scene?: unknown } | undefined)?.scene,
    // The adventure's rules, with their gates' names.
    rules: (z.array(Rule).safeParse(r.adventure['rules']).data ?? []).map((rule) => ({
      text: rule.text,
      status: rule.status,
      source: rule.source,
      gates: rule.gates.map((g) => r.entities.find((e) => e['id'] === g)?.['name'] ?? g),
    })),
  };
}
