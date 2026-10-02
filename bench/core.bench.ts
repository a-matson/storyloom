import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { Bench } from 'tinybench';
import { test } from 'vitest';
import { buildContext } from '@core/context/contextBuilder';
import { rankMemories } from '@core/memory/memoryBank';
import { findTriggeredCards } from '@core/cards/storyCards';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { actionStoryText } from '@core/text/formatting';
import { makeAdventure } from '../tests/fixtures/adventure';

const tokenizer = createApproxTokenizer();
const settings = { contextLength: 16384, memoryBankEnabled: true, cacheStableLayout: true, evictionChunk: 8 };

test('core benchmarks', async () => {
  const bench = new Bench({ time: 500, warmup: true });
  const sizes: Record<string, number> = {};

  for (const n of [100, 1000, 5000]) {
    // Memory bank default cap is 200.
    const adv = makeAdventure({ actions: n, cards: 40, memories: Math.min(200, Math.floor(n / 6)) });
    const ranked = rankMemories(adv.memories, adv.memories[0]?.embedding, 20);
    bench.add(`buildContext ${n} actions`, () => {
      buildContext({ actions: adv.actions, plot: adv.plot, storyCards: adv.storyCards, rankedMemories: ranked, settings, tokenizer });
    });
    bench.add(`structuredClone whole adventure, ${n} actions`, () => structuredClone(adv));
    const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
    sizes[`adventure JSON bytes, ${n} actions`] = bytes(adv);
    sizes[`  actions only, ${n}`] = bytes(adv.actions);
    sizes[`  memories only, ${n}`] = bytes(adv.memories);
  }

  const adv = makeAdventure({ actions: 5000 });
  const oneAction = adv.actions.at(-1);
  bench.add('structuredClone one action', () => structuredClone(oneAction));

  const recent = adv.actions.slice(-8).map(actionStoryText);
  bench.add('findTriggeredCards 40 cards, 8 recent', () => findTriggeredCards(adv.storyCards, recent));

  for (const m of [200, 800]) {
    const bank = makeAdventure({ actions: 0, cards: 0, memories: m }).memories;
    const query = bank[0]?.embedding;
    bench.add(`rankMemories ${m} × 384d`, () => rankMemories(bank, query, 20));
  }

  await bench.run();

  const results = bench.tasks.map((t) => {
    const lat = t.result.state === 'completed' ? t.result.latency : undefined;
    return { name: t.name, meanMs: lat?.mean, p99Ms: lat?.p99, samples: lat?.samplesCount };
  });
  console.table(results);
  console.table(sizes);

  const env = { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, date: new Date().toISOString() };
  mkdirSync('bench/results', { recursive: true });
  writeFileSync(`bench/results/core-${env.date.slice(0, 10)}.json`, JSON.stringify({ env, results, sizes }, null, 2));
});
