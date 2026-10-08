import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { extractFromPassage } from '@core/memory/extract';
import { nextScene } from '@core/memory/scene';
import type { Scene } from '@core/model/types';
import { writeMeasurement } from './env';

// Does the combined helper call report stated time? `pnpm measure clock <url> [label]`; skipped without a url.
const url = process.env['MEASURE_URL'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'before';

const night: Scene = { present: [], time: { day: 1, part: 'night' } };
const morning: Scene = { present: [], time: { day: 1, part: 'morning' } };

// `moves`: should the clock advance? The last passage states no time at all.
const PASSAGES = [
  {
    name: 'sleep until first light',
    from: night,
    moves: true,
    text: '[10] > You lie down by the fire and sleep until first light.\n[11] You wake stiff and cold as the sun clears the ridge. Brann has already packed the camp.',
  },
  {
    name: 'walk on until dusk',
    from: morning,
    moves: true,
    text: '[10] > You walk on until dusk.\n[11] The road climbs through the pines all day. By the time the light fades to red, Mara points out a lantern burning in the valley below.',
  },
  {
    name: 'three days later',
    from: morning,
    moves: true,
    text: '[10] > You wait for the ship.\n[11] Three days later the Gull finally ties up at the quay, its sails patched and salt-white. Captain Orsk waves from the deck.',
  },
  {
    name: 'rest a while',
    from: morning,
    moves: false,
    text: '[10] > You rest a while in the shade.\n[11] Brann passes you the waterskin. A hawk circles over the ridge, and for a moment nobody speaks.',
  },
  {
    name: 'no time',
    from: morning,
    moves: false,
    text: '[10] > You ask Brann about the map.\n[11] "It shows the old mine," Brann says, tracing the line with a thumb. "Nobody has been down there in years."',
  },
];

test.skipIf(!url)('helper call reports stated time', { timeout: 600_000 }, async () => {
  const provider = new LlamaServerProvider('clock', url ?? '');
  const rows = [];
  for (const p of PASSAGES) {
    const reply = await extractFromPassage(p.text, [], { provider, template: 'chatml' });
    const next = reply ? nextScene(p.from, reply, (n) => n !== '') : p.from;
    const advanced = JSON.stringify(next?.time) !== JSON.stringify(p.from.time);
    rows.push({
      passage: p.name,
      moves: p.moves,
      timeDelta: reply?.timeDelta ?? null,
      timeOfDay: reply?.scene?.timeOfDay ?? null,
      after: next?.time ?? null,
      right: advanced === p.moves,
    });
  }
  console.table(rows);
  console.log(`${rows.filter((r) => r.right).length}/${rows.length} right`);
  writeMeasurement(`clock-${LABEL}`, { rows });
});
