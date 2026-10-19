import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { checkSelection } from '@app/session/continuity';
import * as S from '@core/schema';
import { contentClause } from '@core/text/content';
import { writeMeasurement } from './env';

// M27-5: "Check against the record" on a passage over a backup's record, as the selection bar runs it.
// `pnpm measure check <url> <backup> <passage-file> [label]`; skipped without the first three.
const { MEASURE_URL: url, MEASURE_BACKUP: backup, MEASURE_PASSAGE: passage, MEASURE_LABEL: LABEL = 'baseline' } = process.env;

test.skipIf(!url || !backup || !passage)('a passage checked against the record', { timeout: 600_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const text = readFileSync(passage ?? '', 'utf8');
  // As `helperModel.ts` builds it for the story model.
  const model = { provider: new LlamaServerProvider('check', url ?? ''), template: adv.settings.template, content: contentClause(adv.settings, 'record') };
  const findings = await checkSelection(
    {
      adv,
      getSnapshot: () => ({ busy: false }),
      helperModel: async () => model,
      onError: (m) => {
        throw new Error(m);
      },
    },
    text,
  );
  console.log(findings);
  console.log(`wrote ${writeMeasurement(`check-${LABEL}`, { backup, passage: text, findings })}`);
});
