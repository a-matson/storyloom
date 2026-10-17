import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { refreshSummary } from '@core/memory/summary';
import * as S from '@core/schema';
import { contentClause } from '@core/text/content';
import { writeMeasurement } from './env';

// The summary refreshed over a backup's memories from nothing, as the history slides forward 10 times:
// does each refresh change the text? (The M17 dogfood copied its 12-sentence summary 35 times.)
// `pnpm measure summary <url> <backup.storyloom.json> [label]`; skipped without the first two.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'before';
const REFRESHES = 10;

test.skipIf(!url || !backup)('summary refreshes over a backup', { timeout: 1_800_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const deps = { provider: new LlamaServerProvider('summary', url ?? ''), template: adv.settings.template, content: contentClause(adv.settings, 'record') };
  adv.plot = { ...adv.plot, storySummary: '' };
  adv.scriptState = { ...adv.scriptState, __summaryAt: 0, __summaryDirty: false };
  const last = adv.memories.reduce((n, m) => Math.max(n, m.toAction), 0);
  const rows = [];
  for (let i = 1; i <= REFRESHES; i++) {
    const before = adv.plot.storySummary ?? '';
    const start = Date.now();
    const ran = await refreshSummary(adv, { ...deps, historyStart: Math.round((last * i) / REFRESHES) });
    const text = adv.plot.storySummary ?? '';
    rows.push({ at: adv.scriptState.__summaryAt, ran, changed: ran && text !== before, ms: Date.now() - start, text });
    console.log(`--- refresh ${i} (at ${adv.scriptState.__summaryAt}, changed ${text !== before})\n${text}`);
  }
  const changed = rows.filter((r) => r.changed).length;
  console.log(`${changed}/${REFRESHES} changed; wrote ${writeMeasurement(`summary-${LABEL}`, { backup, changed, rows })}`);
});
