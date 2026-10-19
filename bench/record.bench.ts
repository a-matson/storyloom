import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { exportStoryEpub, exportStoryMarkdown, storyParts } from '@adapters/transfer';
import { isCurrent } from '@core/memory/assertionIndex';
import { chapterStarts } from '@core/memory/chapters';
import { compileCodex } from '@core/memory/codex';
import { knowledgeOf } from '@core/memory/knowledge';
import { byPlayer } from '@core/memory/looks';
import { outerGraph } from '@core/memory/places';
import { searchDocs, searchStory } from '@core/memory/search';
import { newSecret } from '@core/memory/secrets';
import { YOU } from '@core/memory/you';
import * as S from '@core/schema';
import { writeMeasurement } from './env';

// The no-model record checks the owed bars name (M27-1, M27-2 planted, M27-4, M27-6, M28-4, M28-5) over one backup.
// `pnpm measure record <backup> [label]`; writes the story as `.md` and `.epub` beside the reading for `epubcheck`.
const { MEASURE_BACKUP: backup, MEASURE_LABEL: LABEL = 'baseline' } = process.env;
/** Fixed so before/after readings search the same words. */
const QUERIES = ['door', 'sword', 'the old man', 'night', 'blood'];

const median = (f: () => unknown, n = 5) => {
  const ms = Array.from({ length: n }, () => {
    const t = performance.now();
    f();
    return performance.now() - t;
  }).toSorted((a, b) => a - b);
  return Number((ms[Math.floor(n / 2)] ?? 0).toFixed(2));
};

test.skipIf(!backup)('record checks over a backup', () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const codexMs = median(() => compileCodex(adv));
  const codex = compileCodex(adv);
  const titles = new Set([...codex.characters, ...codex.places, ...codex.things].map((e) => e.title));
  const who = new Set(adv.assertions.flatMap((a) => (a.kind === 'event' && isCurrent(a) ? a.who : [])));
  who.delete(YOU);
  const missing = [...who].filter((id) => !titles.has(adv.entities.find((e) => e.id === id)?.name ?? ''));

  // M27-2: an event told only to X at the last action, and whom `knowledgeOf` lists it under.
  const at = adv.actions.length - 1;
  const x = adv.entities.find((e) => e.kind === 'character');
  let planted: { to: string; listedUnder: string[] } | undefined;
  if (x) {
    const text = `You whisper to ${x.name} that the vault code is 4417`;
    const event = byPlayer(YOU, at, { kind: 'event', text, who: [YOU, x.id] });
    const told = { ...adv, assertions: [...adv.assertions, event, newSecret(at, text, [x.id])] };
    const listedUnder = adv.entities.filter((e) => knowledgeOf(e.id, told).some((k) => k.id === event.id)).map((e) => e.name);
    planted = { to: x.name, listedUnder };
  }

  // What a keystroke costs in `StorySearch`: the docs are rebuilt per render.
  const searchMs = Object.fromEntries(QUERIES.map((q) => [q, median(() => searchStory(searchDocs(adv), q))]));
  const story = storyParts(adv, 'narration');
  const score = {
    actions: adv.actions.length,
    codexMs,
    missing: missing.length,
    planted,
    outerNodes: outerGraph(adv.entities).nodes.length,
    chapters: chapterStarts(adv.plot).length,
    searchMs,
  };
  console.log('record score', JSON.stringify(score));
  const path = writeMeasurement(`record-${LABEL}`, { backup, score, missing, chapterTitles: story.chapters.map((c) => c.title) });
  writeFileSync(path.replace(/\.json$/, '.md'), exportStoryMarkdown(story, new Map()).data);
  writeFileSync(path.replace(/\.json$/, '.epub'), exportStoryEpub(story, new Map()));
  console.log('wrote', path, '(+ .md, .epub)');
});
