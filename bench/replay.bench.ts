import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { HashEmbedder } from '@adapters/embeddings';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { isCurrent } from '@core/memory/assertionIndex';
import { seedCanonEntities } from '@core/memory/canon';
import { introduce, readMeanwhile, readState, returning, runMemoryMaintenance } from '@core/memory/memoryJobs';
import type { Adventure, Assertion } from '@core/model/types';
import * as S from '@core/schema';
import { contentClause } from '@core/text/content';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { prepareContext } from '@core/turn';
import { writeMeasurement } from './env';

// The memory jobs replayed over a backup from nothing: the player's settings, cards and plot fields, no record.
// `pnpm measure replay <url> <backup.storyloom.json> [label] [to]`; skipped without both. `MEASURE_NAMES=Baron,Goldarok`
// keeps only those names in the per-action rows.
const { MEASURE_URL: url, MEASURE_BACKUP: backup, MEASURE_LABEL: LABEL = 'baseline', MEASURE_TO: TO, MEASURE_NAMES: NAMES } = process.env;
const names = NAMES?.split(',').map((n) => n.trim().toLowerCase());

/** The species look as `currentStates` reads it, with its basis. */
const speciesOf = (as: readonly Assertion[]) => as.findLast((a) => a.kind === 'look' && a.key === 'species' && a.seen !== false && isCurrent(a));

test.skipIf(!url || !backup)('memory jobs replayed over a backup', { timeout: 14_400_000 }, async () => {
  const raw = JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure;
  const src = S.Adventure.parse(raw);
  const { aiInstructions, plotEssentials, authorsNote, thirdPerson, you } = raw.plot ?? {};
  const adv: Adventure = S.Adventure.parse({
    ...raw,
    actions: [],
    entities: seedCanonEntities(src.storyCards, 0),
    assertions: [],
    rules: [],
    memories: [],
    scriptState: {},
    plot: { aiInstructions, plotEssentials, authorsNote, thirdPerson, you },
  });
  const provider = new LlamaServerProvider('replay', url ?? '');
  // As `helperModel.ts` builds it for the story model. The app embeds in a worker; hashes keep the bench server-only.
  const helper = { provider, template: adv.settings.template, content: contentClause(adv.settings, 'record') };
  const embedder = new HashEmbedder();
  const turn = { provider, tokenizer: createApproxTokenizer(), contextSize: 8192, embedder };
  const { stateRead } = adv.settings.memory;
  const chunk = adv.settings.context.evictionChunk;
  const to = Math.min(src.actions.length, Number(TO ?? src.actions.length));
  let historyStart: number | undefined;
  let maintainedAt = 0;
  const rows = [];
  for (let i = 0; i < to; i++) {
    const a = src.actions[i];
    if (!a) break;
    const ai = a.type === 'continue' || a.type === 'start';
    // The prompt that produced this output, so a card written by an earlier turn read shows when it first triggers.
    let cards: string[] = [];
    let cast: string[] = [];
    if (ai && i > 0) {
      const prepared = await prepareContext(adv, adv.actions, turn);
      if ('stopped' in prepared) throw new Error(prepared.stopped);
      cards = prepared.result.triggeredCards.map((m) => m.card.name);
      cast = prepared.result.usedEntityIds.flatMap((id) => adv.entities.find((e) => e.id === id)?.name ?? []);
      historyStart = prepared.result.historyRange?.from;
    }
    adv.actions = [...adv.actions, a];
    if (ai) {
      // `MemoryScheduler` order: the turn read (read B merged), the standalone read when not merged, meanwhile, then maintenance.
      const r = await introduce(adv, helper, undefined, { state: stateRead === 'every' });
      if (stateRead === 'every' && r.state === undefined) await readState(adv, helper);
      if (returning(adv).length) await readMeanwhile(adv, helper);
      if (adv.actions.length - maintainedAt >= chunk) {
        if (stateRead === 'idle') await readState(adv, helper);
        await runMemoryMaintenance(adv, { ...helper, embedder, historyStart });
        maintainedAt = adv.actions.length;
      }
    }
    const present = new Set(adv.plot.scene?.present ?? []);
    const entities = adv.entities
      .filter((e) => !names || [e.name, ...e.aliases].some((n) => names.includes(n.toLowerCase())))
      .map((e) => {
        const own = adv.assertions.filter((x) => x.subject === e.id);
        const species = speciesOf(own);
        return { name: e.name, kind: e.kind, species: species?.kind === 'look' ? species.value : undefined, basis: species?.basis, present: present.has(e.id) };
      });
    const conflicts = adv.assertions.flatMap((x) =>
      x.kind === 'conflict' && x.seen === false
        ? [{ subject: adv.entities.find((e) => e.id === x.subject)?.name ?? x.subject, key: x.key, claimed: x.claimed, canon: x.canon }]
        : [],
    );
    rows.push({ at: i, type: a.type, entities, conflicts, cardsTriggered: cards, cast });
    console.log(`#${i} ${a.type} entities ${adv.entities.length} conflicts ${conflicts.length} cards [${cards.join(', ')}]`);
  }
  console.log(writeMeasurement(`replay-${LABEL}`, { backup, to, names: NAMES, rows, memories: adv.memories.length, summary: adv.plot.storySummary }));
});
