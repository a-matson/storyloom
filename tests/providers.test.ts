import { describe, expect, it } from 'vitest';
import { ProviderError } from '@adapters/providers/http';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { OpenAICompatProvider } from '@adapters/providers/openaiCompat';
import type { CompletionChunk } from '@core/ports';

/** A response whose body arrives in exactly these chunks (to exercise split events). */
function chunked(chunks: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' }, ...init });
}

const fetchOnce =
  (res: Response): typeof fetch =>
  () =>
    Promise.resolve(res);
const req = { prompt: 'p', maxTokens: 8, temperature: 1 };

async function all(stream: AsyncIterable<CompletionChunk>): Promise<CompletionChunk[]> {
  const out: CompletionChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe('llama-server streaming', () => {
  it('joins events split across network chunks', async () => {
    const p = new LlamaServerProvider(
      'l',
      'http://x',
      fetchOnce(
        chunked([
          'data: {"cont',
          'ent":"Hel"}\n',
          '\ndata: {"content":"lo"}\n\n',
          'data: {"content":"","stop":true,"stop_type":"eos","timings":{"cache_n":3,"prompt_n":0}}\n\n',
        ]),
      ),
    );
    const chunks = await all(p.complete(req));
    expect(chunks.map((c) => c.text).join('')).toBe('Hello');
    expect(chunks.at(-1)).toMatchObject({ done: true, stats: { cachedTokens: 3, stopReason: 'eos' } });
  });

  it('passes running timings on token chunks, so a cancelled stream keeps its stats', async () => {
    const p = new LlamaServerProvider(
      'l',
      'http://x',
      fetchOnce(chunked(['data: {"content":"Hi","stop":false,"timings":{"cache_n":30,"prompt_n":10,"prompt_ms":75,"predicted_n":1}}\n\n'])),
    );
    const [first] = await all(p.complete(req));
    expect(first).toMatchObject({ text: 'Hi', done: false, stats: { promptTokens: 40, cachedTokens: 30, promptMs: 75, generatedTokens: 1 } });
  });

  // Real llama-server payloads: `tokens_cached` covers the whole prompt even on a cold request.
  it.each([
    ['cold', { cache_n: 0, prompt_n: 1200 }, { promptTokens: 1200, cachedTokens: 0 }],
    ['cached', { cache_n: 1150, prompt_n: 50 }, { promptTokens: 1200, cachedTokens: 1150 }],
  ])('reads prompt stats from timings (%s)', async (_, t, stats) => {
    const end = { content: '', stop: true, tokens_evaluated: 1200, tokens_cached: 1264, timings: { ...t, prompt_ms: 9, predicted_n: 64, predicted_ms: 9 } };
    const p = new LlamaServerProvider('l', 'http://x', fetchOnce(chunked([`data: ${JSON.stringify(end)}\n\n`])));
    expect((await all(p.complete(req))).at(-1)).toMatchObject({ stats });
  });

  // Real end events carry only `stop_type`; `none` means aborted or still running.
  it.each([
    ['eos', 'eos'],
    ['word', 'stop'],
    ['limit', 'length'],
    ['none', 'unknown'],
  ])('maps stop_type %s to %s', async (stop_type, stopReason) => {
    const end = { content: '', stop: true, stop_type, stopping_word: '' };
    const p = new LlamaServerProvider('l', 'http://x', fetchOnce(chunked([`data: ${JSON.stringify(end)}\n\n`])));
    expect((await all(p.complete(req))).at(-1)).toMatchObject({ stats: { stopReason } });
  });

  // History eviction drops the prompt's head; KV shifting keeps the rest of the cache.
  it('asks the server to reuse shifted cache chunks', async () => {
    let sent: unknown;
    const p = new LlamaServerProvider('l', 'http://x', (_url, init) => {
      sent = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      return Promise.resolve(chunked(['data: {"content":"","stop":true,"stop_type":"eos"}\n\n']));
    });
    await all(p.complete(req));
    expect(sent).toMatchObject({ cache_prompt: true, n_cache_reuse: 64 });
  });

  it('fails loudly on a malformed event instead of dropping it', async () => {
    const p = new LlamaServerProvider('l', 'http://x', fetchOnce(chunked(['data: {not json}\n\n'])));
    await expect(all(p.complete(req))).rejects.toThrow(ProviderError);
  });

  it('rejects events of the wrong shape with the field path', async () => {
    const p = new LlamaServerProvider('l', 'http://x', fetchOnce(chunked(['data: {"content":42}\n\n'])));
    await expect(all(p.complete(req))).rejects.toThrow(/content/);
  });

  it('keeps the HTTP status on errors', async () => {
    const p = new LlamaServerProvider('l', 'http://x', fetchOnce(new Response('busy', { status: 503, statusText: 'Service Unavailable' })));
    const err = await all(p.complete(req)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err instanceof ProviderError && err.status).toBe(503);
  });

  it('reports an unhealthy server when /props has the wrong shape', async () => {
    const fake: typeof fetch = (input) =>
      Promise.resolve(Response.json(new Request(input).url.endsWith('/health') ? { status: 'ok' } : { total_slots: 'two' }));
    const h = await new LlamaServerProvider('l', 'http://x', fake).health();
    expect(h.ok).toBe(false);
    expect(!h.ok && h.message).toMatch(/total_slots/);
  });
});

describe('OpenAI-compatible streaming', () => {
  it('streams text, ends on usage and ignores [DONE]', async () => {
    const events = [
      'data: {"choices":[{"text":"Hi","finish_reason":null}]}\n\n',
      'data: {"choices":[{"text":"!","finish_reason":"length"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ];
    const p = new OpenAICompatProvider('o', 'http://x', {}, fetchOnce(chunked(events)));
    const chunks = await all(p.complete(req));
    expect(chunks.map((c) => c.text).join('')).toBe('Hi!');
    expect(chunks.at(-1)).toMatchObject({ done: true, stats: { promptTokens: 5, generatedTokens: 2, stopReason: 'length' } });
  });
});
