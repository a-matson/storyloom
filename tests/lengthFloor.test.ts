import { describe, expect, it } from 'vitest';
import { createBlankAdventure } from '@core/model';
import type { CompletionRequest, CompletionStats, Provider } from '@core/ports';
import { generate } from '@core/turn/generate';
import type { TurnDeps } from '@core/turn';
import { createApproxTokenizer } from '@core/text';

interface Reply {
  words: number;
  stopReason: NonNullable<CompletionStats['stopReason']>;
}

/** One reply per request: `words` single-token chunks, then a done chunk with `stopReason`. */
function scripted(replies: Reply[]) {
  const requests: CompletionRequest[] = [];
  const provider: Provider = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.reject(new Error('unused')),
    async *complete(req, signal) {
      const reply = replies[requests.length];
      requests.push(req);
      if (!reply) throw new Error('unexpected request');
      for (let i = 0; i < reply.words; i++) {
        if (signal?.aborted) return;
        yield { text: `w${requests.length}${i} `, done: false };
      }
      yield { text: '', done: true, stats: { stopReason: reply.stopReason } };
    },
  };
  const deps: TurnDeps = { provider, tokenizer: createApproxTokenizer() };
  return { requests, deps };
}

async function run(replies: Reply[], signal?: AbortSignal) {
  const { requests, deps } = scripted(replies);
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.settings.model.responseLength = 100;
  const request: CompletionRequest = { prompt: 'PROMPT', maxTokens: 180, temperature: 1, seed: 7 };
  const gen = generate(adventure, request, deps, signal);
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  return { requests, out: next.value };
}

describe('length floor', () => {
  it('continues a 40-token EOS reply once, with its text as the start of the reply', async () => {
    const { requests, out } = await run([
      { words: 40, stopReason: 'eos' },
      { words: 30, stopReason: 'eos' },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.prompt.startsWith('PROMPTw10 ')).toBe(true);
    expect(requests[1]?.maxTokens).toBe(180 - 40);
    expect(requests[1]?.seed).not.toBe(7);
    expect(out.stats?.continued).toBe(true);
    expect(out.stats?.generatedTokens).toBe(70);
    expect(out.text).toContain('w139 w20');
  });

  it('leaves a 150-token reply alone', async () => {
    const { requests, out } = await run([{ words: 60, stopReason: 'eos' }]);
    expect(requests).toHaveLength(1);
    expect(out.stats?.continued).toBeUndefined();
  });

  it('accepts a continuation that also ends short', async () => {
    const { requests, out } = await run([
      { words: 10, stopReason: 'eos' },
      { words: 5, stopReason: 'eos' },
    ]);
    expect(requests).toHaveLength(2);
    expect(out.stats?.generatedTokens).toBe(15);
  });

  it('does not continue a reply that hit the token limit', async () => {
    const { requests } = await run([{ words: 40, stopReason: 'length' }]);
    expect(requests).toHaveLength(1);
  });

  it('stops streaming when aborted during the continuation', async () => {
    const ac = new AbortController();
    const { deps } = scripted([
      { words: 20, stopReason: 'eos' },
      { words: 20, stopReason: 'eos' },
    ]);
    const adventure = createBlankAdventure('Test', 'You stand at the gate.');
    adventure.settings.model.responseLength = 100;
    const gen = generate(adventure, { prompt: 'P', maxTokens: 180, temperature: 1 }, deps, ac.signal);
    let seen = 0;
    for (let n = await gen.next(); !n.done; n = await gen.next()) {
      if (++seen === 21) ac.abort();
    }
    expect(seen).toBeLessThan(41);
  });
});
