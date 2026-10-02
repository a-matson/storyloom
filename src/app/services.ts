import type { Adventure, AppSettings } from '@core/model';
import { GameSession } from './session';
import { AppSettings as AppSettingsSchema } from '@core/schema';
import { createApproxTokenizer } from '@core/text';
import { createProvider, DEFAULT_PROVIDER_CONFIG } from '@adapters/providers';
import { DexieStorage } from '@adapters/storage';
import type { Provider, Storage } from '@core/ports';
import { HashEmbedder, loadInBrowserEmbedder, ProviderEmbedder } from '@adapters/embeddings';
import { type Embedder } from '@core/ports';
import { NoopScriptRunner } from '@core/ports';

/**
 * App-wide singletons. Kept out of React so the engine, workers and tests can
 * share them. `services.provider(id)` caches one Provider per config.
 */
export { DEFAULT_PROVIDER_CONFIG };
export const tokenizer = createApproxTokenizer();
export const storage: Storage = new DexieStorage();
export const scripts = new NoopScriptRunner();

const providers = new Map<string, Provider>();
const embedders = new Map<string, Embedder>();

export const DEFAULT_APP_SETTINGS: AppSettings = AppSettingsSchema.parse({
  providers: [DEFAULT_PROVIDER_CONFIG],
  defaultProviderId: DEFAULT_PROVIDER_CONFIG.id,
});

export function providerFor(settings: AppSettings, id: string): Provider {
  const cfg = settings.providers.find((p) => p.id === id) ?? settings.providers[0] ?? DEFAULT_PROVIDER_CONFIG;
  const key = `${cfg.id}|${cfg.kind}|${cfg.baseUrl}`;
  let p = providers.get(key);
  if (!p) {
    p = createProvider(cfg);
    providers.set(key, p);
  }
  return p;
}

// One worker for the whole app; a failed load is cached too, so it is tried once per page load.
let inBrowser: Promise<Embedder | null> | undefined;
function inBrowserEmbedder(): Promise<Embedder | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  return (inBrowser ??= loadInBrowserEmbedder().catch((e: unknown) => {
    console.info('no local embedding model in public/models/; using the hash embedder', e);
    return null;
  }));
}

/** Tiers: backend `/embedding` -> in-browser Transformers.js model -> hashing fallback. */
export async function embedderFor(provider: Provider): Promise<Embedder> {
  const key = provider.id;
  const cached = embedders.get(key);
  if (cached) return cached;
  let e: Embedder | null = null;
  try {
    const caps = await provider.capabilities();
    if (caps.embeddings && provider.embed) e = new ProviderEmbedder(provider.embed.bind(provider), 0, `${provider.id}-embed`);
  } catch (err) {
    console.warn('embedding capability probe failed; trying the local model', err);
  }
  e ??= (await inBrowserEmbedder()) ?? new HashEmbedder();
  embedders.set(key, e);
  return e;
}

/** Opens an adventure as a session wired to the app-wide services. */
export function openSession(adventure: Adventure, app: AppSettings): GameSession {
  return new GameSession(adventure, app, {
    providerFor,
    embedderFor,
    tokenizer,
    scripts,
    storage,
    idle: (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn) : setTimeout(fn, 800)),
    frame: (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)),
    saveDelayMs: 300,
  });
}
