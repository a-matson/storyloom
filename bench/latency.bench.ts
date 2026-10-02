import { test } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import type { CompletionRequest } from '@core/ports';
import { writeMeasurement } from './env';

// Run with `pnpm measure latency <url> [turns]`; skipped otherwise so `pnpm bench` needs no backend.
const url = process.env['MEASURE_URL'];
const turns = Number(process.env['MEASURE_TURNS'] ?? 5);

/** A story prefix that grows by one line per turn, like a real adventure. */
const prefix = (n: number) =>
  `You are the narrator of a fantasy adventure.\n${Array.from({ length: n }, (_, i) => `> You do thing ${i}.\nSomething happens ${i}.\n`).join('')}> You look around.\n`;

test.skipIf(!url)('latency against a live backend', async () => {
  const provider = new LlamaServerProvider('measure', url ?? '');
  const rows = [];
  for (const [label, cachePrompt] of [
    ['cold', false],
    ['cached', true],
  ] as const) {
    for (let n = 0; n < turns; n++) {
      const req: CompletionRequest = { prompt: prefix(40 + n), maxTokens: 64, temperature: 0.8, seed: 1, slotId: 0, cachePrompt };
      const t0 = performance.now();
      let ttftMs: number | undefined;
      let stats;
      for await (const c of provider.complete(req)) {
        if (ttftMs === undefined && c.text !== '') ttftMs = performance.now() - t0;
        if (c.done) stats = c.stats;
      }
      const totalMs = performance.now() - t0;
      const { promptTokens = 0, cachedTokens = 0, generatedTokens = 0, generationMs = 0 } = stats ?? {};
      const hit = promptTokens > 0 ? cachedTokens / promptTokens : undefined;
      const tokPerS = generationMs > 0 ? generatedTokens / (generationMs / 1000) : undefined;
      rows.push({ mode: label, turn: n, ttftMs, totalMs, cacheHit: hit, tokPerS, promptTokens: stats?.promptTokens, generatedTokens: stats?.generatedTokens });
    }
  }
  console.table(rows);
  console.log(writeMeasurement('latency', { url, health: await provider.health(), rows }));
});
