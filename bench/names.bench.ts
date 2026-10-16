import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { parseOwn } from '@adapters/transfer/own';
import { mergeEntity } from '@core/memory/entities';
import { candidateNames, newNamesIn, notNewName, sightings } from '@core/memory/fold';
import { kindOf } from '@core/memory/kindCues';
import { knownAs } from '@core/memory/names';
import { actionText, type Adventure, type Entity } from '@core/model';
import { writeMeasurement } from './env';
import { RecallHistory, stripAdventure } from './recallHistory';

// New-name candidates and their kinds, replayed action by action with no model. `pnpm measure names <backups> [label]`.
const backups = process.env['MEASURE_BACKUP']?.split(',') ?? [];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';

function load(path: string): Adventure {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const h = RecallHistory.safeParse(data);
  const adv = h.success ? h.data.adventure : parseOwn(data);
  if (!adv) throw new Error(`${path}: not a backup or a recall history`);
  return adv;
}

interface Row {
  name: string;
  reply: Entity['kind'];
  kind: Entity['kind'];
  dropped?: 'common' | 'article';
}

/** Each candidate once: its card as the replay made it, or why it never became one. */
function replay(original: Adventure): Row[] {
  // The kind the model gave the card in this story; `character` for a name it never carded.
  const replyOf = (name: string) => knownAs(original.entities, name)?.kind ?? 'character';
  const adv = stripAdventure(original);
  const rows = new Map<string, Row>();
  for (const [i, action] of adv.actions.entries()) {
    const range = { fromAction: i, toAction: i + 1 };
    const known = adv.entities.flatMap((e) => [e.name, ...e.aliases]);
    for (const name of candidateNames(actionText(action), known)) {
      const dropped = notNewName(adv, name, range);
      if (dropped && !rows.has(name)) rows.set(name, { name, reply: replyOf(name), kind: replyOf(name), dropped });
    }
    for (const name of newNamesIn(adv, range)) {
      const reply = replyOf(name);
      const kind = kindOf(name, reply, sightings(adv, name, range));
      rows.set(name, { name, reply, kind });
      adv.entities = [...adv.entities, mergeEntity(undefined, { name, kind, description: '' }, i)];
    }
  }
  return [...rows.values()];
}

test.skipIf(!backups.length)('new-name candidates and kinds over backups', () => {
  const out = backups.map((backup) => {
    const rows = replay(load(backup));
    console.log(`\n${backup}`);
    for (const r of rows) console.log(`  ${r.name} · ${r.kind}${r.kind === r.reply ? '' : ` (was ${r.reply})`}${r.dropped ? ` · dropped (${r.dropped})` : ''}`);
    const cards = rows.filter((r) => !r.dropped);
    return { backup, candidates: rows.length, cards: cards.length, rekinded: cards.filter((r) => r.kind !== r.reply).length, rows };
  });
  console.log(writeMeasurement(`names-${LABEL}`, { backups: out }));
});
