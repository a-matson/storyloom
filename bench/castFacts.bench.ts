import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { parseOwn } from '@adapters/transfer/own';
import { askedFacts } from '@core/context/asked';
import { indexAssertions, textOf } from '@core/memory/assertionIndex';
import { COMMON_WORDS } from '@core/memory/commonWords';
import { isConfirmed } from '@core/memory/facts';
import { actionText, type Adventure } from '@core/model';
import { writeMeasurement } from './env';
import { storeAt } from './storeAt';

// The facts each player action of a backup asks for, no model. `pnpm measure cast-facts <backups> [label]`.
const backups = process.env['MEASURE_BACKUP']?.split(',') ?? [];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';

/**
 * Per player action: each absent entity that got facts, and the facts. The final cards stand in for the
 * cards at the time (first seen before the action); presence comes from `plot.presence`.
 */
function replay(adv: Adventure) {
  let named = 0;
  const rows = adv.actions.flatMap((action, i) => {
    const ix = indexAssertions(storeAt(adv.assertions, i));
    const here = new Set(adv.plot.presence?.findLast((p) => p.at <= i)?.present ?? []);
    const entities = adv.entities.filter((e) => e.firstSeen < i && isConfirmed(e, ix.of(e.id)));
    const absent = entities.filter((e) => !here.has(e.id) && !e.cardId);
    const all = [...askedFacts(action, absent, entities, ix, COMMON_WORDS)];
    if (all.length) named++;
    const asked = all.filter(([, facts]) => facts.length);
    if (!asked.length) return [];
    const byId = new Map(entities.map((e) => [e.id, e.name]));
    return [{ at: i, action: actionText(action), asked: asked.map(([id, facts]) => ({ entity: byId.get(id), facts: facts.map(textOf) })) }];
  });
  return { named, rows };
}

test.skipIf(!backups.length)('facts the player asks about, action by action', () => {
  const out = backups.map((backup) => {
    const adv = parseOwn(JSON.parse(readFileSync(backup, 'utf8')));
    if (!adv) throw new Error(`${backup}: not a backup`);
    const { named, rows } = replay(adv);
    console.log(`\n${backup}: ${named} player actions name an absent entity, ${rows.length} send facts`);
    for (const r of rows) {
      console.log(`  #${r.at} ${r.action.trim().slice(0, 140)}`);
      for (const a of r.asked) console.log(`    ${a.entity}: ${a.facts.join(' | ')}`);
    }
    return { backup, actions: adv.actions.length, named, asked: rows.length, rows };
  });
  console.log(writeMeasurement(`cast-facts-${LABEL}`, { backups: out }));
});
