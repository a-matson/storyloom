import { expect, test } from '@playwright/test';
import { z } from 'zod/mini';
import * as S from '@core/schema';
import { pastTense } from '@core/trace';
import { writeMeasurement } from '../../bench/env';
import { readDb, TURNS } from '../../bench/livePlay';

// `pnpm measure repetition <url> [label]`: the live scenario's turns with nothing else going on; never runs in CI.
const URL = process.env['MEASURE_URL'];
// "64,0" plays with llama-server's old repeat window and no DRY: the "before" of a before/after.
const SAMPLERS = process.env['MEASURE_SAMPLERS'];
test.skip(!URL, 'needs MEASURE_URL (a running llama-server)');

const TURN_MS = 180_000;
// Same seed on both sides of a before/after. [provisional]
const SEED = '42';

const fourGrams = (text: string) => {
  const w = text.toLowerCase().match(/[a-z']+/g) ?? [];
  return w.slice(3).map((_, i) => w.slice(i, i + 4).join(' '));
};

test('repetition bench', async ({ page }) => {
  test.setTimeout(TURNS.length * TURN_MS);
  await page.goto('/');
  await page.getByRole('button', { name: /^llama-server/ }).click();
  await page.getByRole('textbox', { name: /Server URL/ }).fill(URL ?? '');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect(page).toHaveURL(/#\/adventure\//);

  const toggle = page.getByRole('button', { name: 'Adventure settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await page.getByText('Model settings', { exact: true }).click();
  const [repeatWindow, dry] = SAMPLERS?.split(',') ?? [];
  for (const [name, value] of [
    ['Seed (blank = random)', SEED],
    ['Repeat window (tokens)', repeatWindow],
    ['DRY multiplier (0 = off)', dry],
  ] as const) {
    if (value === undefined) continue;
    const field = page.getByRole('spinbutton', { name });
    await field.fill(value);
    await field.blur();
  }

  for (const [mode, text] of TURNS) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('textbox', { name: 'Take a turn' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: TURN_MS });
  }

  const db = await readDb(page);
  const text = new Map(
    z
      .array(S.Action)
      .parse(db.actions)
      .map((a) => [a.id, a.versions[a.active] ?? '']),
  );
  const turns = z
    .array(S.TurnTrace)
    .parse(db.traces)
    .filter((t) => t.outcome === 'done' && t.actionId !== undefined)
    .map((t) => ({ out: text.get(t.actionId ?? '') ?? '', repeated: t.repeatedPhrases ?? [], stopReason: t.stopReason }));
  const counts = new Map<string, number>();
  for (const p of turns.flatMap((t) => t.repeated)) counts.set(p, (counts.get(p) ?? 0) + 1);
  const grams = turns.flatMap((t) => fourGrams(t.out));
  const mean = (xs: number[]) => +(xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(2);

  const label = process.env['MEASURE_LABEL'];
  const path = writeMeasurement(label ? `repetition-${label}` : 'repetition', {
    url: URL,
    samplers: SAMPLERS ?? 'adventure defaults',
    seed: SEED,
    turns: turns.length,
    repeatedPerTurn: mean(turns.map((t) => t.repeated.length)),
    distinct4gramRatio: +(new Set(grams).size / (grams.length || 1)).toFixed(3),
    meanWords: mean(turns.map((t) => t.out.split(/\s+/).filter(Boolean).length)),
    stopLength: turns.filter((t) => t.stopReason === 'length').length,
    pastTense: turns.filter((t) => pastTense(t.out)).length,
    topPhrases: [...counts].toSorted((a, b) => b[1] - a[1]).slice(0, 10),
    outputs: turns.map((t) => t.out),
  });
  console.log(`wrote ${path}`);
  expect(turns.length).toBeGreaterThanOrEqual(TURNS.length);
});
