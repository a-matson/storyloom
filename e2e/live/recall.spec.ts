import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod/mini';
import { dueMemoryRanges, entitiesOverdue } from '@core/memory';
import * as S from '@core/schema';
import { FACTS, FILLERS, isOrig, retrievalHit, scenarioJson, scoreProbe, type Verdict } from '../../bench/recall';
import { HISTORY_FILE, HISTORY_SETTINGS, RecallHistory, sliceHistory, stripAdventure, turnEnds } from '../../bench/recallHistory';
import { writeMeasurement } from '../../bench/env';
import { costAndState, lastTurn, readAdventure, rewind, run, shownAdventure, turn, type Rows } from '../../bench/recallPage';

// `pnpm measure recall-record <url>` once per fact set, then `pnpm measure recall <url>`; never runs in CI.
const URL = process.env['MEASURE_URL'];
test.skip(!URL, 'needs MEASURE_URL (a running llama-server)');
const MODE = process.env['MEASURE_MODE'] === 'record' ? 'record' : 'replay';
const SEED = Number(process.env['MEASURE_SEED'] ?? HISTORY_SETTINGS.seed);

// Probes are undone, so once caught up nothing is due between them. [provisional]
const PROBE_READ_MS = 2000;
// Catch-up: how often to look, how long the store must sit still (one combined call), and the cap. [provisional]
const POLL_MS = 5000;
const SETTLED_MS = 30_000;
// Depth 90 re-derives ~30 memories and ~30 entity calls one after another: 20 min was not enough. [measured: 2026-10-07-recall-w2e-run1.json]
const CATCH_UP_CAP_MS = 35 * 60_000;
// `MEASURE_DEPTHS=30,60` shortens a run; a single small depth smoke-tests the path.
const DEPTHS = (process.env['MEASURE_DEPTHS'] ?? '30,60,90').split(',').map(Number);

const warnings: string[] = [];

/**
 * The second opinion on a keyword verdict: a direct `/completion` call, no chat template. One call per
 * probe: batched, the story model answered "yes" to all 24. [measured: 2026-10-07-recall-replay-smoke.json]
 */
async function judge(output: string, statement: string): Promise<string> {
  const prompt = `Passage:\n"""${output}"""\n\nStatement: "${statement}"\n\nDoes the passage contradict the statement? Answer with one word: yes, no, or unclear.\nAnswer:`;
  const res = await fetch(`${URL}/completion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, n_predict: 4, temperature: 0, seed: 1, stream: false, cache_prompt: false }),
  });
  if (!res.ok) return `error ${res.status}`;
  const { content } = z.object({ content: z.optional(z.string()) }).parse(await res.json());
  const word = (content ?? '').trim().toLowerCase();
  return word.startsWith('yes') ? 'contradicts' : word.startsWith('no') ? 'consistent' : 'unclear';
}

/** Canon is planted as scenario cards, not adventure cards: only a scenario's cards seed canon entities. */
async function playScenario(page: Page): Promise<void> {
  const s = S.Scenario.parse(scenarioJson());
  const chooser = page.waitForEvent('filechooser');
  await page.getByTitle('Storyloom scenario JSON').click();
  await (await chooser).setFiles({ name: 'recall.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(s)) });
  await page.getByRole('button', { name: `Play ${s.title}` }).click();
  await page.getByRole('dialog', { name: s.title }).getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Model settings', { exact: true }).click();
  for (const [name, v] of [
    ['Response length', HISTORY_SETTINGS.responseLength],
    ['Seed (blank = random)', SEED],
  ] as const) {
    const box = page.getByRole('spinbutton', { name });
    await box.fill(String(v));
    await box.blur();
    await expect(box).toHaveValue(String(v));
  }
}

/** Plants over turns 1-20 (a filler after every fourth), fillers to the deepest depth, no probes; saves the history. */
async function record(page: Page): Promise<void> {
  const started = Date.now();
  await playScenario(page);
  const planted = FACTS.filter((f) => f.plant[0] === 'Do' || f.plant[0] === 'Say');
  let story = 0;
  for (const [i, f] of planted.entries()) {
    await turn(page, f.plant[0] as 'Do' | 'Say', f.plant[1]);
    story++;
    if (i % 4 === 3) {
      await turn(page, ...(FILLERS[i] ?? ['Do', 'look around']));
      story++;
    }
  }
  const deepest = Math.max(...DEPTHS);
  for (; story < deepest; story++) await turn(page, ...(FILLERS[story % FILLERS.length] ?? ['Do', 'look around']));

  // The app's own export, so the recording is exactly what Library `Import…` reads back.
  await page.getByRole('tab', { name: 'Adventure' }).click();
  await page.getByRole('button', { name: 'Details' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON (full backup)' }).click();
  const { adventure } = z.object({ adventure: S.Adventure }).parse(JSON.parse(readFileSync(await (await download).path(), 'utf8')));
  const rows = await readAdventure(page, shownAdventure(page));
  const { model } = lastTurn(rows);
  const ends = turnEnds(adventure.actions);
  expect(ends).toHaveLength(story);
  const history: RecallHistory = {
    format: 'storyloom-recall-history',
    version: 1,
    recordedAt: new Date().toISOString(),
    model,
    facts: FACTS.map((f) => f.id),
    turnEnds: ends,
    adventure: stripAdventure(adventure),
  };
  writeFileSync(HISTORY_FILE, `${JSON.stringify(history, null, 2)}\n`);
  const path = writeMeasurement('recall-record', {
    url: URL,
    model,
    mode: 'record',
    seed: SEED,
    runMs: Date.now() - started,
    stalls: run.stalls,
    ...costAndState(rows),
    warnings,
  });
  console.log(`wrote ${HISTORY_FILE} and ${path}`);
}

/** A fresh adventure: the recording cut at `depth`, through Library `Import…` (zod-checked, ids renumbered). */
async function importHistory(page: Page, h: RecallHistory, depth: number): Promise<string> {
  // Not straight after setup: a reload then can beat the settings save and land on first-run setup again.
  if (page.url().includes('#/adventure/')) await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTitle('Storyloom JSON, or an AI Dungeon adventure export (JSON or zip)').click();
  const file = { format: 'storyloom-adventure', version: 1, adventure: sliceHistory(h, depth, SEED) };
  await (await chooser).setFiles({ name: `recall-d${depth}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page
    .getByRole('button', { name: new RegExp(`^Continue Recall d${depth} `) })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/adventure\//);
  return shownAdventure(page);
}

const Progress = z.object({
  actions: z.array(z.object({ type: S.ActionType })),
  memories: z.array(S.Memory),
  entities: z.array(z.unknown()),
  adventure: z.object({ scriptState: S.ScriptState, plot: S.PlotComponents }),
});

/** One filler turn starts maintenance; done once nothing is due and the store has sat still. */
async function catchUp(page: Page, id: string): Promise<number> {
  const started = Date.now();
  await turn(page, 'Do', 'look around');
  let seen = '';
  let still = Date.now();
  while (Date.now() - started < CATCH_UP_CAP_MS) {
    await page.waitForTimeout(POLL_MS);
    const p = Progress.parse(await readAdventure(page, id));
    const due = dueMemoryRanges(p.actions, p.memories).length > 0 || entitiesOverdue({ memories: p.memories, scriptState: p.adventure.scriptState });
    const now = [p.memories.length, p.entities.length, p.adventure.scriptState.__entitiesAt, p.adventure.plot.storySummary?.length].join('|');
    if (now !== seen || due) [seen, still] = [now, Date.now()];
    else if (Date.now() - still >= SETTLED_MS) return Date.now() - started;
  }
  warnings.push(`catch-up hit its ${CATCH_UP_CAP_MS / 60_000} min cap`);
  return Date.now() - started;
}

test('recall benchmark', async ({ page }) => {
  test.setTimeout(3 * 60 * 60_000);
  // Background jobs fail only into the console; the review needs to see them.
  page.on('console', (m) => void (['warning', 'error'].includes(m.type()) && warnings.push(m.text().slice(0, 300))));
  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  if (MODE === 'record') return record(page);

  if (!existsSync(HISTORY_FILE)) throw new Error(`no ${HISTORY_FILE}: run \`pnpm measure recall-record <url>\` first`);
  const history = RecallHistory.parse(JSON.parse(readFileSync(HISTORY_FILE, 'utf8')));
  expect(history.facts, 'the recording was made for another fact set').toEqual(FACTS.map((f) => f.id));

  // Each probe is undone, so every probe of a depth sees the same history and no memory comes due between them.
  type Row = { depth: number; id: string; class: string; verdict: Verdict; judge: string; retrieved: boolean; output: string; scene?: string | undefined };
  // On a retrieval miss: did the bank hold the fact (a ranking miss) or not (a summary miss)?
  // On a canon probe: did memory content (a memory, or a canon entity's fact) contradict the canon?
  const rows: (Row & { miss?: { bankHit: boolean; prompt: string }; memoryContra?: boolean })[] = [];
  const catchUpMs: Record<number, number> = {};
  const probesMs: Record<number, number> = {};
  const state: Record<number, ReturnType<typeof costAndState>> = {};
  let model: string | undefined;
  for (const depth of DEPTHS) {
    const id = await importHistory(page, history, depth);
    catchUpMs[depth] = await catchUp(page, id);
    const started = Date.now();
    const base = (await readAdventure(page, id)).actions.length;
    let r: Rows | undefined;
    for (const f of FACTS) {
      await turn(page, f.probe[0], f.probe[1], PROBE_READ_MS);
      r = await readAdventure(page, id);
      await rewind(page, id, base);
      const { output, prompt, model: m, bank, canonFacts } = lastTurn(r);
      model = m;
      const retrieved = retrievalHit(prompt, f);
      rows.push({
        depth,
        id: f.id,
        class: f.class,
        verdict: scoreProbe(output, f),
        judge: await judge(output, f.statement),
        retrieved,
        output,
        scene: /\[Scene:[^\]]*\]/.exec(prompt)?.[0],
        ...(retrieved ? {} : { miss: { bankHit: bank.some((t) => retrievalHit(t, f)), prompt } }),
        ...(f.class === 'canon' ? { memoryContra: [...bank, ...canonFacts].some((t) => scoreProbe(t, f) === 'contradicted') } : {}),
      });
    }
    probesMs[depth] = Date.now() - started;
    if (r) state[depth] = costAndState(r);
  }

  const tally = (of: typeof rows) => {
    const byClass: Record<string, Record<string, number>> = {};
    for (const r of of) {
      const cell = (byClass[`${r.class}@${r.depth}`] ??= { honoured: 0, absent: 0, contradicted: 0, retrieved: 0 });
      cell[r.verdict] = (cell[r.verdict] ?? 0) + 1;
      if (r.retrieved) cell['retrieved'] = (cell['retrieved'] ?? 0) + 1;
    }
    return byClass;
  };
  const orig = new Set(FACTS.filter(isOrig).map((f) => f.id));
  const label = process.env['MEASURE_LABEL'];
  const path = writeMeasurement(label ? `recall-${label}` : 'recall', {
    url: URL,
    model,
    mode: 'replay',
    historyFile: HISTORY_FILE,
    recordedAt: history.recordedAt,
    seed: SEED,
    judgeBatched: true,
    depths: DEPTHS,
    stalls: run.stalls,
    catchUpMs,
    probesMs,
    byClass: tally(rows),
    // The v1.0.0 baseline's 12 facts, comparable to it and to the wave-1 runs.
    orig: tally(rows.filter((r) => orig.has(r.id))),
    probes: rows,
    state,
    warnings,
  });
  console.log(`wrote ${path}`);
  expect(rows.length).toBe(FACTS.length * DEPTHS.length);
});
