import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { z } from 'zod/mini';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { findRules } from '@core/memory/findRules';
import { writeMeasurement } from './env';

// M24-2: "Find rules in this passage" over labelled passages; per case the rules found, expected ones matched, spurious ones.
// `pnpm measure rules <url> [label]`; skipped without a url. Bar: every expected rule found, 0 from a rule-less passage.
const { MEASURE_URL: url, MEASURE_LABEL: LABEL = 'baseline' } = process.env;

const Cases = z.object({ cases: z.array(z.object({ at: z.number(), text: z.string(), expect: z.array(z.string()) })) });

test.skipIf(!url)('rules found in labelled passages', { timeout: 600_000 }, async () => {
  const { cases } = Cases.parse(JSON.parse(readFileSync('bench/rulesCases.json', 'utf8')));
  const provider = new LlamaServerProvider('rules', url ?? '');
  const rows = [];
  for (const c of cases) {
    const action = { id: `a${c.at}`, type: 'continue' as const, versions: [c.text], active: 0, createdAt: 0 };
    const found = (await findRules({ actions: [action], entities: [], rules: [] }, { provider, template: 'chatml' }, 0)).map((r) => r.text);
    const hit = (word: string) => found.some((t) => t.toLowerCase().includes(word));
    const matched = c.expect.filter(hit).length;
    const spurious = found.filter((t) => !c.expect.some((w) => t.toLowerCase().includes(w))).length;
    rows.push({ at: c.at, expect: c.expect, found, matched, spurious });
    console.log(`#${c.at} ${matched}/${c.expect.length} expected, ${spurious} spurious`, found);
  }
  const score = {
    expected: rows.reduce((n, r) => n + r.expect.length, 0),
    matched: rows.reduce((n, r) => n + r.matched, 0),
    spurious: rows.reduce((n, r) => n + r.spurious, 0),
    fromRuleless: rows.filter((r) => !r.expect.length).reduce((n, r) => n + r.found.length, 0),
  };
  console.log(score);
  console.log(`wrote ${writeMeasurement(`rules-${LABEL}`, { url, score, rows })}`);
});
