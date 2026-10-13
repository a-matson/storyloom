import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { isRecord } from '@adapters/transfer/own';
import * as S from '@core/schema';
import { deriveAssertions } from '@core/memory/assertions';
import { writeMeasurement } from './env';

// What the typed store keeps of a backup's entity facts. `pnpm measure migrate <backup.storyloom.json> [label]`.
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';

test.skipIf(!backup)('entity facts to assertions over a backup', () => {
  // Not `parseOwn`: it migrates on import, and this counts what the migration keeps.
  const data: unknown = JSON.parse(readFileSync(backup ?? '', 'utf8'));
  const adv = S.LegacyAdventure.parse(isRecord(data) && 'adventure' in data ? data['adventure'] : data);
  const facts = adv.entities.flatMap((e) => e.facts ?? []);
  const byId = new Map(deriveAssertions(adv).map((x) => [x.id, x]));
  const kept = (id: string) => byId.get(`as_${id}`);
  const out = {
    backup,
    facts: facts.length,
    assertions: byId.size,
    dropped: {
      conflict: facts.filter((f) => f.conflict && !kept(f.id)).length,
      unsupportedSpan: facts.filter((f) => f.evidence !== undefined && kept(f.id)?.span === undefined).length,
    },
    lostSourced: facts.filter((f) => f.sourceId !== undefined && f.conflict !== true && !kept(f.id)).length,
  };
  console.log(out, writeMeasurement(`migrate-${LABEL}`, out));
  expect(out.lostSourced).toBe(0);
});
