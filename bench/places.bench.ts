import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { placeAt, roomOf } from '@core/memory/rooms';
import { actionText, type Entity } from '@core/model/types';
import * as S from '@core/schema';
import { writeMeasurement } from './env';

// M23-6: each place of a backup replayed at its first sighting through `roomOf`, with the scene's location of then
// (`sceneLog`) and the action text there; how many stay top-level. `pnpm measure places <backup> [label]`, no model.
const { MEASURE_BACKUP: backup, MEASURE_LABEL: LABEL = 'baseline' } = process.env;

test.skipIf(!backup)('places filed as rooms over a backup', () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const log = adv.plot.sceneLog ?? [];
  const places: Entity[] = [];
  const filed: { place: string; under: string; at: number }[] = [];
  for (const p of adv.entities.filter((e) => e.kind === 'place').toSorted((a, b) => a.firstSeen - b.firstSeen)) {
    const { partOf: _p, ...bare } = p;
    const inside = placeAt(places, log.findLast((s) => s.at < p.firstSeen)?.location);
    const act = adv.actions[p.firstSeen];
    const room = inside && roomOf(p.name, act ? actionText(act) : '', inside, places);
    places.push(room ? { ...bare, partOf: room.id } : bare);
    if (room) filed.push({ place: p.name, under: room.name, at: p.firstSeen });
  }
  const topLevel = places.filter((e) => !e.partOf).map((e) => e.name);
  const score = { places: places.length, topLevel: topLevel.length, filed: filed.length };
  console.log('places score', JSON.stringify(score), JSON.stringify(topLevel));
  for (const f of filed) console.log(`#${f.at} ${f.place} → ${f.under}`);
  console.log('wrote', writeMeasurement(`places-${LABEL}`, { backup, score, topLevel, filed }));
});
