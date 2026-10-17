import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { test } from 'vitest';
import { parseOwn } from '@adapters/transfer/own';
import { indexAssertions } from '@core/memory/assertionIndex';
import { checkInputs } from '@core/memory/contradiction';
import { currentStates, isLook } from '@core/memory/looks';
import { actionText, type Adventure } from '@core/model';
import { storeAt } from './storeAt';

// Builds contradiction cases from backups' AI outputs, no model: `pnpm measure contradiction-cases <backups> [file]`.
// Labels are written by hand afterwards; the file is never overwritten.
const backups = process.env['MEASURE_BACKUP']?.split(',') ?? [];
const OUT = process.env['MEASURE_CASES'] ?? 'bench/contradiction-dogfood.json';
const PER_BACKUP = 20;
/** The final scene's place stands in for the place at `i` only this close to the end (no location history). */
const PLACE_TAIL = 5;

/**
 * The check's inputs as they stood before output `i`. No dogfood locked a key, so every current look of a
 * present character counts as locked: the lines a player who locks looks would send.
 */
function inputsAt(adv: Adventure, i: number): string[] {
  const assertions = storeAt(adv.assertions, i);
  const ix = indexAssertions(assertions);
  const present = adv.plot.presence?.findLast((p) => p.at < i)?.present ?? [];
  const entities = adv.entities.map((e) => ({ ...e, canonKeys: Object.keys(currentStates(ix.of(e.id))).filter((k) => isLook(k) && k !== 'legacy') }));
  const location = i >= adv.actions.length - PLACE_TAIL ? adv.plot.scene?.location : undefined;
  return checkInputs({ entities, assertions, plot: { ...adv.plot, scene: { present, ...(location ? { location } : {}) } }, settings: adv.settings });
}

test.skipIf(!backups.length)('contradiction cases from backups', () => {
  const cases = backups.flatMap((backup) => {
    const adv = parseOwn(JSON.parse(readFileSync(backup, 'utf8')));
    if (!adv) throw new Error(`${backup}: not a backup`);
    const all = adv.actions.flatMap((a, i) => {
      const lines = a.type === 'continue' ? inputsAt(adv, i) : [];
      return lines.some((l) => !l.startsWith('Scene: '))
        ? [{ probe: `${basename(backup, '.storyloom.json')}@${i}`, output: actionText(a), lines, contradicts: null }]
        : [];
    });
    console.log(`${backup}: ${all.length} outputs with a locked line`);
    return Array.from({ length: Math.min(PER_BACKUP, all.length) }, (_, k) => all[Math.floor((k * all.length) / Math.min(PER_BACKUP, all.length))]);
  });
  writeFileSync(OUT, `${JSON.stringify(cases, null, 2)}\n`, { flag: 'wx' });
  console.log(`${OUT}: ${cases.length} cases`);
});
