import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { isCurrent } from '@core/memory/assertionIndex';
import { knownAs } from '@core/memory/names';
import { standing, stanceWord } from '@core/memory/standing';
import { YOU } from '@core/memory/you';
import * as S from '@core/schema';
import { writeMeasurement } from './env';

// M26-6: per current relationship, its standing after each stored event; the word changes with their `crossedAt`.
// `pnpm measure standings <backup> [label]`, no model.
const { MEASURE_BACKUP: backup, MEASURE_LABEL: LABEL = 'baseline' } = process.env;

test.skipIf(!backup)('stance changes over a backup', () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const name = (id: string) => (id === YOU ? 'you' : (adv.entities.find((e) => e.id === id)?.name ?? id));
  const events = adv.assertions.filter((a) => a.kind === 'event' && isCurrent(a));
  const ats = [...new Set(events.map((e) => e.at))].toSorted((a, b) => a - b);
  const changes = [];
  let relationships = 0;
  for (const r of adv.assertions) {
    if (r.kind !== 'relationship' || !isCurrent(r)) continue;
    const from = r.to.toLowerCase() === YOU ? YOU : knownAs(adv.entities, r.to)?.id;
    if (from === undefined) continue;
    relationships++;
    let was = r.stance;
    for (const at of ats) {
      const s = standing(
        r,
        events.filter((e) => e.at <= at),
        from,
      );
      const now = stanceWord(r, s);
      if (now !== was) changes.push({ subject: name(r.subject), toward: name(from), at, from: was, to: now, crossedAt: s.crossedAt });
      was = now;
    }
  }
  const score = { relationships, events: events.length, changes: changes.length, traced: changes.filter((c) => c.crossedAt !== undefined).length };
  console.log('standings score', JSON.stringify(score));
  for (const c of changes) console.log(`#${c.at} ${c.subject} → ${c.toward}: ${c.from} → ${c.to} (crossedAt ${c.crossedAt ?? '-'})`);
  console.log('wrote', writeMeasurement(`standings-${LABEL}`, { backup, score, changes }));
});
