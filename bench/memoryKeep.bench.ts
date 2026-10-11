import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { dueMemoryRanges } from '@core/memory/memoryBank';
import { memoryText } from '@core/memory/memoryJobs';
import { actionText } from '@core/model';
import type { Provider } from '@core/ports';
import { writeMeasurement } from './env';
import { FACTS } from './recall';
import { HISTORY_FILE, RecallHistory } from './recallHistory';

// Does the memory for a planted Do/Say keep the fact? `pnpm measure memory-keep <url> [label]`; skipped without a url.
const url = process.env['MEASURE_URL'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'before';
// Words that must not turn up in a memory: the details of the example the prompt used to carry.
const LEAK_WORDS = (process.env['MEASURE_LEAK_WORDS'] ?? 'dunmere,copper ring,two pennies,loft above the stables,snowed in').split(',');

test.skipIf(!url)('memories keep planted facts', { timeout: 900_000 }, async () => {
  const history = RecallHistory.parse(JSON.parse(readFileSync(HISTORY_FILE, 'utf8')));
  const { actions, settings } = history.adventure;
  const ranges = dueMemoryRanges(actions, []);
  let calls = 0;
  // Counts summarise calls, so a second one means the first reply was rejected.
  const provider = new (class extends LlamaServerProvider {
    override complete(...args: Parameters<Provider['complete']>) {
      calls++;
      return super.complete(...args);
    }
  })('memory-keep', url ?? '');
  const rows = [];
  for (const fact of FACTS.filter((f) => f.plant[0] === 'Do' || f.plant[0] === 'Say')) {
    const at = actions.findIndex((a) => actionText(a).includes(fact.plant[1]));
    const range = ranges.find((r) => r.fromAction <= at && at < r.toAction);
    if (!range) {
      rows.push({ id: fact.id, memory: `no range for action ${at}`, kept: false, retried: false });
      continue;
    }
    calls = 0;
    const memory = await memoryText(actions.slice(range.fromAction, range.toAction), { provider, template: settings.template }, { memoriesRejected: 0 });
    const lower = memory.toLowerCase();
    rows.push({ id: fact.id, memory, kept: fact.expect.some((k) => lower.includes(k)), retried: calls > 1 });
  }
  console.table(rows.map(({ memory: _m, ...r }) => r));
  const leaked = rows.filter((r) => LEAK_WORDS.some((d) => r.memory.toLowerCase().includes(d))).length;
  console.log(`${rows.filter((r) => r.kept).length}/${rows.length} kept, ${leaked} with example details`);
  writeMeasurement(`memory-keep-${LABEL}`, { rows });
});
