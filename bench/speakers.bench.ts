import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { parseOwn } from '@adapters/transfer/own';
import { actionText, type Speaker } from '@core/model';
import { guessSpeakers, type SpeakerRules } from '@core/text/speakers';
import { writeMeasurement } from './env';

// The speaker guess and the batch read's stored `speakers`, scored on bench/speakerLabels.json. No model.
// `pnpm measure speakers <backup> [label]`.
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';

interface Label {
  action: number;
  paragraph: number;
  speaker: string;
}

function score(labels: readonly Label[], named: (l: Label) => string | undefined) {
  const rows = labels.map((l) => ({ ...l, named: named(l) }));
  const hits = rows.filter((r) => r.named);
  const correct = hits.filter((r) => r.named === r.speaker).length;
  const speaking = rows.filter((r) => r.speaker !== 'none' && r.speaker !== 'you').length;
  const wrong = hits.filter((r) => r.named !== r.speaker).map((r) => `${r.action}/${r.paragraph}: ${r.named} (is ${r.speaker})`);
  return { named: hits.length, correct, precision: correct / hits.length, recall: correct / speaking, wrong };
}

const nameAt = (speakers: readonly Speaker[] | undefined, paragraph: number) => speakers?.find((s) => s.paragraph === paragraph)?.name;

test.skipIf(!backup)('speaker guess and batch field over hand labels', () => {
  const adv = parseOwn(JSON.parse(readFileSync(backup ?? '', 'utf8')));
  if (!adv) throw new Error(`${backup}: not a backup`);
  const { labels } = JSON.parse(readFileSync('bench/speakerLabels.json', 'utf8')) as { labels: Label[] };
  const cast = adv.entities.filter((e) => e.kind === 'character');
  const text = (i: number) => {
    const a = adv.actions[i];
    if (!a) throw new Error(`no action ${i}`);
    return actionText(a);
  };
  const sets: Record<string, SpeakerRules> = { v1: { subject: false }, subject: {} };
  const rules = Object.fromEntries(
    Object.entries(sets).map(([name, r]) => [name, score(labels, (l) => nameAt(guessSpeakers(text(l.action), cast, r), l.paragraph))]),
  );
  const batch = score(labels, (l) => nameAt(adv.actions[l.action]?.speakers, l.paragraph));
  for (const [name, s] of Object.entries({ ...rules, batch })) {
    console.log(`${name}: precision ${s.correct}/${s.named} = ${s.precision.toFixed(2)}, recall ${s.recall.toFixed(2)}`);
    for (const w of s.wrong) console.log(`  ${w}`);
  }
  console.log(writeMeasurement(`speakers-${LABEL}`, { backup, labels: labels.length, rules, batch }));
});
