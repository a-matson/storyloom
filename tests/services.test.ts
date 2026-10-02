import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS, embedderFor, openSession, providerFor } from '@app/services';
import { createBlankAdventure, type AppSettings } from '@core/model';
import type { Provider } from '@core/ports';

const demoApp: AppSettings = {
  ...DEFAULT_APP_SETTINGS,
  providers: [{ id: 'demo', kind: 'demo', name: 'Demo', baseUrl: 'demo' }],
  defaultProviderId: 'demo',
};

describe('services', () => {
  it('defaults to a local llama-server', () => {
    expect(DEFAULT_APP_SETTINGS.providers[0]).toMatchObject({ kind: 'llama-server', baseUrl: 'http://localhost:8080' });
    expect(DEFAULT_APP_SETTINGS.theme).toBe('dark');
  });

  it('caches one provider per config and falls back to the first', () => {
    const a = providerFor(demoApp, 'demo');
    expect(providerFor(demoApp, 'demo')).toBe(a);
    expect(providerFor(demoApp, 'missing')).toBe(a);
  });

  it('uses the hash embedder when the backend has no embeddings', async () => {
    const e = await embedderFor(providerFor(demoApp, 'demo'));
    expect(e.id).toBe('hash-bow');
    expect(await embedderFor(providerFor(demoApp, 'demo'))).toBe(e);
  });

  it('uses the in-browser model when it loads and the backend has none', async () => {
    class ReadyWorker extends EventTarget {
      postMessage(): void {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' } })));
      }
      terminate(): void {}
    }
    vi.stubGlobal('Worker', ReadyWorker);
    const p = { id: 'no-emb', capabilities: () => Promise.resolve({ embeddings: false }) } as unknown as Provider;
    expect((await embedderFor(p)).id).toBe('tjs-bge-small-en-v1.5');
    vi.unstubAllGlobals();
  });

  it('uses server embeddings when offered', async () => {
    const p = {
      id: 'emb',
      capabilities: () => Promise.resolve({ embeddings: true }),
      embed: (t: string[]) => Promise.resolve(t.map(() => [1, 0])),
    } as unknown as Provider;
    const e = await embedderFor(p);
    expect(await e.embed(['x'])).toEqual([[1, 0]]);
  });

  it('opens a session wired to the app services', () => {
    const s = openSession(createBlankAdventure('T', 'Start.'), demoApp);
    expect(s.getSnapshot().actions).toHaveLength(1);
  });
});
