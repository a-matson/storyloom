import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { parseOwn } from '@adapters/transfer/own';
import type { GateReason } from '@core/model';
import { GATE_WINDOW, gateOutput, previousOutputs } from '@core/turn/gate';
import { writeMeasurement } from './env';

// The output gate over every AI output of a backup, no model. `pnpm measure gate <backup> [label]`.
// `first` gates each output's first version (what the model wrote before any re-roll), `active` the one kept.
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';

test.skipIf(!backup)('output gate over a backup', () => {
  const adv = parseOwn(JSON.parse(readFileSync(backup ?? '', 'utf8')));
  if (!adv) throw new Error(`${backup}: not a backup`);
  const thirdPerson = adv.plot.thirdPerson?.enabled ?? false;
  const count = (pick: 'first' | 'active') => {
    const flags: Record<GateReason, number[]> = { empty: [], verbatim: [], agency: [] };
    adv.actions.forEach((a, i) => {
      if (a.type !== 'continue') return;
      const text = (pick === 'first' ? a.versions[0] : a.versions[a.active]) ?? '';
      const reason = gateOutput(text, previousOutputs(adv.actions.slice(0, i), undefined, GATE_WINDOW), {
        playerType: adv.actions[i - 1]?.type,
        thirdPerson,
      });
      if (reason) flags[reason].push(i);
    });
    return flags;
  };
  const outputs = adv.actions.filter((a) => a.type === 'continue').length;
  const after = adv.actions.filter((a, i) => a.type === 'continue' && (adv.actions[i - 1]?.type === 'do' || adv.actions[i - 1]?.type === 'say')).length;
  const first = count('first');
  const active = count('active');
  for (const [name, f] of Object.entries({ first, active }))
    console.log(`${name}: empty ${f.empty.length}, verbatim ${f.verbatim.length}, agency ${f.agency.length} (of ${after} after do/say) / ${outputs} outputs`);
  console.log(writeMeasurement(`gate-${LABEL}`, { backup, outputs, afterDoSay: after, thirdPerson, first, active }));
});
