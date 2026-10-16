import { expect, type Page } from '@playwright/test';
import { z } from 'zod/mini';
import { dueMemoryRanges, entitiesOverdue } from '@core/memory';
import * as S from '@core/schema';
import { Rule } from '@core/schema/rule';
import { indexAssertions, textOf } from '@core/memory/assertionIndex';
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

/** One adventure's rows straight from IndexedDB; memory embeddings are left behind unless asked for. */
export function readAdventure(page: Page, id: string, { embeddings = false } = {}) {
  return page.evaluate(
    async ({ adventureId, keep }) => {
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
        // Stored as a Float32Array; a plain array crosses back and parses as `Memory`.
        memories: (await rows('memories')).map(({ embedding, ...m }) =>
          keep && embedding instanceof Float32Array ? { ...m, embedding: Array.from(embedding) } : m,
        ),
        entities: await rows('entities'),
        assertions: await rows('assertions'),
        traces: await rows('traces'),
      };
      db.close();
      return out;
    },
    { adventureId: id, keep: embeddings },
  );
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

// Catch-up: how often to look, and how long the store must sit still (one combined call). [provisional]
const POLL_MS = 5000;
const SETTLED_MS = 30_000;
// A range the model rejects twice is retried every pass and stays due, so a still store with work due
// settles too, after longer. [measured: 2026-10-16-recall-smoke-d12-cap.json] [provisional]
const STUCK_MS = 3 * 60_000;

const Progress = z.object({
  actions: z.array(z.object({ type: S.ActionType })),
  memories: z.array(S.Memory),
  entities: z.array(z.unknown()),
  adventure: z.object({ scriptState: S.ScriptState, plot: S.PlotComponents }),
});

/**
 * One filler turn starts maintenance; done once nothing is due and the store has sat still, or at `capMs`.
 * `summaryAts` is every `__summaryAt` seen on the way: how often the summary moved.
 */
export async function catchUp(page: Page, id: string, capMs: number) {
  const started = Date.now();
  await turn(page, 'Do', 'look around');
  const summaryAts = new Set<number>();
  let seen = '';
  let still = Date.now();
  let due: string[] = [];
  while (Date.now() - started < capMs) {
    await page.waitForTimeout(POLL_MS);
    const p = Progress.parse(await readAdventure(page, id));
    const at = p.adventure.scriptState.__summaryAt;
    if (at !== undefined) summaryAts.add(at);
    due = [
      ...dueMemoryRanges(p.actions, p.memories).map((r) => `${r.fromAction}-${r.toAction}`),
      ...(entitiesOverdue({ memories: p.memories, scriptState: p.adventure.scriptState }) ? ['entities'] : []),
    ];
    const now = [p.memories.length, p.entities.length, p.adventure.scriptState.__entitiesAt, p.adventure.plot.storySummary?.length, ...due].join('|');
    if (now !== seen) [seen, still] = [now, Date.now()];
    // Only the newest range can stick: a pass writes past a rejected one, and the next starts after it.
    // Anything more due is real work; a pass sat over 3 min without a write at d90.
    else if (Date.now() - still >= (due.length === 0 ? SETTLED_MS : due.length === 1 && due[0] !== 'entities' ? STUCK_MS : Infinity))
      return { ms: Date.now() - started, capHit: false, stuck: due, summaryAts: [...summaryAts] };
  }
  return { ms: Date.now() - started, capHit: true, stuck: due, summaryAts: [...summaryAts] };
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
    memoryIds: (trace['memoryIds'] ?? []) as string[],
    sections: Object.fromEntries(((trace['sections'] ?? []) as { kind: string; tokens: number }[]).map((s) => [s.kind, s.tokens])),
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
  const ix = indexAssertions(z.array(S.Assertion).parse(r.assertions));
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
      // Looks and state are keyed assertions: dumped apart, so `facts` counts traits (and conflicts) only.
      .map((e) => {
        const as = ix.of(e.id);
        return {
          kind: e.kind,
          name: e.name,
          canon: e.canon,
          looks: appearanceOf(as),
          state: Object.fromEntries(Object.entries(currentStates(as)).filter(([k]) => !LOOKS.has(k))),
          facts: as.flatMap((a) => (a.kind === 'trait' ? [a.text] : a.kind === 'conflict' ? [`CONFLICT ${textOf(a)}`] : [])),
        };
      }),
    scene: (r.adventure['plot'] as { scene?: unknown } | undefined)?.scene,
    // What the summary and the bank cover, read by hand for the coverage bar.
    summary: (r.adventure['plot'] as { storySummary?: unknown } | undefined)?.storySummary,
    summaryAt: (r.adventure['scriptState'] as { __summaryAt?: unknown } | undefined)?.__summaryAt,
    memories: (r.memories as { text: string; fromAction: number; toAction: number }[]).map((m) => `${m.fromAction}-${m.toAction}: ${m.text}`),
    // The adventure's rules, with their gates' names.
    rules: (z.array(Rule).safeParse(r.adventure['rules']).data ?? []).map((rule) => ({
      text: rule.text,
      status: rule.status,
      source: rule.source,
      gates: rule.gates.map((g) => r.entities.find((e) => e['id'] === g)?.['name'] ?? g),
    })),
  };
}
