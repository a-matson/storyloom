import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { cardProposals } from '@core/memory/duplicates';
import * as S from '@core/schema';
import { writeMeasurement } from './env';
import { mergeScore } from './merges';

// M23-6: the near-duplicate proposals over a backup's stored cards, each card new in turn by first sighting, and the
// cards left once all are accepted. `pnpm measure duplicates <backup> [label]`, no model.
const { MEASURE_BACKUP: backup, MEASURE_LABEL: LABEL = 'baseline' } = process.env;

test.skipIf(!backup)('near-duplicate cards over a backup', () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const cards = adv.entities.toSorted((a, b) => a.firstSeen - b.firstSeen);
  const asks = cards.reduce<NonNullable<typeof adv.scriptState.__aliasProposals>>(
    (asked, e, i) => [...asked, ...cardProposals(cards.slice(0, i + 1), cards.slice(0, i), asked, e.firstSeen)],
    [],
  );
  const score = mergeScore({ entities: cards, scriptState: { __aliasProposals: asks } });
  console.log('duplicates score', JSON.stringify(score));
  console.log('wrote', writeMeasurement(`duplicates-${LABEL}`, { backup, cards: cards.length, ...score }));
});
