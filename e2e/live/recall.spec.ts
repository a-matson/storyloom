import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod/mini';
import * as S from '@core/schema';
import { FACTS, FILLERS, retrievalHit, scoreProbe, type SeededFact, type Verdict } from '../../bench/recall';
import { writeMeasurement } from '../../bench/env';

// `pnpm measure recall <url>`: the recall baseline against a real llama-server; never runs in CI.
const URL = process.env['MEASURE_URL'];
test.skip(!URL, 'needs MEASURE_URL (a running llama-server)');

// Same gaps as `play.spec.ts` so memory jobs get their idle slot. [provisional]
const READ_MS = 6000;
// Higher than play.spec.ts's 180 s: at full context a prefill competes with memory jobs on the
// other slot. A 180 s cap lost a run at turn ~93. [measured: 2026-10-06]
const TURN_MS = 300_000;
// `MEASURE_DEPTHS=30,60` shortens a re-run; a single small depth smoke-tests the path.
const DEPTHS = (process.env['MEASURE_DEPTHS'] ?? '30,60,90').split(',').map(Number);

const send = (page: Page) => page.getByRole('button', { name: 'Send' });
/** Turns whose stream stalled and had to be stopped and re-rolled; reported with the run. */
let stalls = 0;

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
async function turn(page: Page, mode: 'Do' | 'Say', text: string): Promise<void> {
  await page.getByRole('button', { name: mode, exact: true }).click();
  await page.getByRole('textbox', { name: 'Take a turn' }).fill(text);
  await send(page).click();
  const stop = page.getByRole('button', { name: 'Stop generating' });
  await expect(stop).toBeVisible();
  if (!(await idle(page, TURN_MS))) {
    stalls++;
    await stop.click();
    await expect(send(page)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Retry/ }).click();
    await expect(send(page)).toBeVisible({ timeout: TURN_MS });
  }
  await page.waitForTimeout(READ_MS);
}

/** The newest AI output and the prompt that produced it. */
function lastTurn(page: Page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('storyloom');
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const newest = (store: string) =>
      new Promise<Record<string, unknown>>((ok, fail) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.addEventListener('success', () => {
          const rows = r.result as { createdAt: number }[];
          ok(rows.toSorted((a, b) => a.createdAt - b.createdAt).at(-1) ?? {});
        });
        r.addEventListener('error', () => fail(r.error));
      });
    const action = await newest('actions');
    const trace = await newest('traces');
    const memories = await new Promise<{ text: string; forgotten?: boolean; stale?: boolean }[]>((ok, fail) => {
      const r = db.transaction('memories').objectStore('memories').getAll();
      r.addEventListener('success', () => ok(r.result as { text: string }[]));
      r.addEventListener('error', () => fail(r.error));
    });
    db.close();
    const versions = (action['versions'] ?? []) as string[];
    return {
      output: versions[(action['active'] ?? 0) as number] ?? '',
      prompt: (trace['prompt'] ?? '') as string,
      model: trace['modelId'] as string | undefined,
      bank: memories.filter((m) => !m.forgotten && !m.stale).map((m) => m.text),
    };
  });
}

/**
 * The second opinion on a keyword verdict. A direct `/completion` call, not the page's
 * provider: it needs no chat template for a yes/no and still only one server.
 */
/** Per-turn cost and the wave-1 state (entities, scene) at the end of the run, for the M9 review. */
async function costAndState(page: Page) {
  const db = await page.evaluate(async () => {
    const req = indexedDB.open('storyloom');
    const idb = await new Promise<IDBDatabase>((ok, fail) => {
      req.addEventListener('success', () => ok(req.result));
      req.addEventListener('error', () => fail(req.error));
    });
    const all = (store: string) =>
      new Promise<Record<string, unknown>[]>((ok, fail) => {
        const r = idb.transaction(store).objectStore(store).getAll();
        r.addEventListener('success', () => ok(r.result as Record<string, unknown>[]));
        r.addEventListener('error', () => fail(r.error));
      });
    const out = { traces: await all('traces'), entities: await all('entities'), adventures: await all('adventures') };
    idb.close();
    return out;
  });
  const traces = z
    .array(S.TurnTrace)
    .parse(db.traces)
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
      .parse(db.entities)
      .map(({ kind, name, canon, facts, state }) => ({ kind, name, canon, state, facts: facts.map((f) => (f.conflict ? `CONFLICT ${f.text}` : f.text)) })),
    scene: db.adventures.map((a) => (a['plot'] as { scene?: unknown } | undefined)?.scene),
  };
}

async function judge(output: string, fact: SeededFact): Promise<string> {
  const prompt = `Passage:\n"""${output}"""\n\nStatement: "${fact.statement}"\n\nDoes the passage contradict the statement? Answer with one word: yes, no, or unclear.\nAnswer:`;
  const res = await fetch(`${URL}/completion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, n_predict: 4, temperature: 0, seed: 1, stream: false, cache_prompt: false }),
  });
  if (!res.ok) return `error ${res.status}`;
  const { content } = (await res.json()) as { content?: string };
  const word = (content ?? '').trim().toLowerCase();
  return word.startsWith('yes') ? 'contradicts' : word.startsWith('no') ? 'consistent' : 'unclear';
}

async function plantCanon(page: Page): Promise<void> {
  // The sidebar starts open on wide screens; the header button toggles it.
  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const essentials = FACTS.filter((f) => f.plant[0] === 'essentials').map((f) => f.plant[1]);
  if (essentials.length > 0) {
    await page.locator('summary', { hasText: 'Plot Essentials' }).click();
    await page.getByRole('textbox', { name: 'Plot Essentials' }).fill(essentials.join(' '));
  }
  await page.getByRole('button', { name: /^Story cards/ }).click();
  for (const f of FACTS) {
    if (f.plant[0] !== 'card' || !f.card) continue;
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('#card-name').fill(f.card.name);
    await page.locator('#card-entry').fill(f.plant[1]);
    await page.locator('#card-triggers').fill(f.card.triggers);
    await page.getByRole('button', { name: 'Finish' }).click();
  }
  await page.getByRole('button', { name: 'Close settings' }).click();
}

test('recall benchmark', async ({ page }) => {
  test.setTimeout(3 * 60 * 60_000);
  // Background jobs fail only into the console; the review needs to see them.
  const warnings: string[] = [];
  page.on('console', (m) => void (['warning', 'error'].includes(m.type()) && warnings.push(m.text().slice(0, 300))));
  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await plantCanon(page);

  // Turns 1-10: the eight acted plants, with a filler after every fourth.
  const planted = FACTS.filter((f) => f.plant[0] === 'Do' || f.plant[0] === 'Say');
  for (const [i, f] of planted.entries()) {
    await turn(page, f.plant[0] as 'Do' | 'Say', f.plant[1]);
    if (i % 4 === 3) await turn(page, ...(FILLERS[i] ?? FILLERS[0] ?? ['Do', 'look around']));
  }

  // ponytail: probes stay in the log, so a fact restated at depth 30 helps itself at 60.
  // Erasing them instead would trigger stale-memory regeneration and distort the idle windows.
  type Row = { depth: number; id: string; class: string; verdict: Verdict; judge: string; retrieved: boolean; tail: string; scene?: string | undefined };
  // On a retrieval miss: did the bank hold the fact (a ranking miss) or not (a summary miss)?
  const rows: (Row & { miss?: { bankHit: boolean; prompt: string } })[] = [];
  let story = planted.length + 2;
  let model: string | undefined;
  for (const depth of DEPTHS) {
    for (; story < depth; story++) await turn(page, ...(FILLERS[story % FILLERS.length] ?? ['Do', 'look around']));
    for (const f of FACTS) {
      await turn(page, f.probe[0], f.probe[1]);
      const { output, prompt, model: m, bank } = await lastTurn(page);
      model = m;
      const retrieved = retrievalHit(prompt, f);
      rows.push({
        depth,
        id: f.id,
        class: f.class,
        verdict: scoreProbe(output, f),
        judge: await judge(output, f),
        retrieved,
        tail: output.slice(-200),
        scene: /\[Scene:[^\]]*\]/.exec(prompt)?.[0],
        ...(retrieved ? {} : { miss: { bankHit: bank.some((t) => retrievalHit(t, f)), prompt } }),
      });
    }
  }

  const byClass: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const key = `${r.class}@${r.depth}`;
    const cell = (byClass[key] ??= { honoured: 0, absent: 0, contradicted: 0, retrieved: 0 });
    cell[r.verdict] = (cell[r.verdict] ?? 0) + 1;
    if (r.retrieved) cell['retrieved'] = (cell['retrieved'] ?? 0) + 1;
  }
  const label = process.env['MEASURE_LABEL'];
  const path = writeMeasurement(label ? `recall-${label}` : 'recall', {
    url: URL,
    model,
    depths: DEPTHS,
    stalls,
    byClass,
    probes: rows,
    ...(await costAndState(page)),
    warnings,
  });
  console.log(`wrote ${path}`);
  expect(rows.length).toBe(FACTS.length * DEPTHS.length);
});
