import { describe, expect, it } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { collect } from '@core/ports/provider';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';

const handler = createFakeLlama({ wordDelayMs: 0 });
const provider = new LlamaServerProvider('d', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));

describe('demo backend', () => {
  it('reports health and capabilities', async () => {
    const h = await provider.health();
    expect(h.ok).toBe(true);
    expect(h.modelId).toBe('Fake-12B-Q4_K_M.gguf');
    const caps = await provider.capabilities();
    expect(caps.embeddings).toBe(false);
    expect(caps.parallelSlots).toBe(2);
  });

  it('streams text then final stats', async () => {
    const { text, stats } = await collect(
      provider.complete({
        prompt: 'hello there',
        maxTokens: 50,
        temperature: 1,
      }),
    );
    expect(text.length).toBeGreaterThan(10);
    expect(stats?.generatedTokens).toBeGreaterThan(0);
    expect(stats?.cachedTokens).toBeGreaterThan(0);
    expect(stats?.stopReason).toBe('eos');
  });

  it('answers json_schema requests with a card', async () => {
    const { text } = await collect(
      provider.complete({
        prompt: 'name is "Zed"',
        maxTokens: 50,
        temperature: 1,
        jsonSchema: { type: 'object' },
      }),
    );
    expect(JSON.parse(text)).toMatchObject({ name: 'Zed' });
  });

  it('404s unknown paths', async () => {
    expect((await handler(new Request('http://demo.invalid/nope'))).status).toBe(404);
  });
});
