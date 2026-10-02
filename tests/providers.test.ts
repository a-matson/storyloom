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
        chunked(['data: {"cont', 'ent":"Hel"}\n', '\ndata: {"content":"lo"}\n\n', 'data: {"content":"","stop":true,"stopped_eos":true,"tokens_cached":3}\n\n']),
      ),
    );
    const chunks = await all(p.complete(req));
    expect(chunks.map((c) => c.text).join('')).toBe('Hello');
    expect(chunks.at(-1)).toMatchObject({ done: true, stats: { cachedTokens: 3, stopReason: 'eos' } });
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
