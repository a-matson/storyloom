import { hasScripts, imageProvider, type Adventure, type AppSettings } from '@core/model';
import { GameSession } from './session';
import { AppSettings as AppSettingsSchema } from '@core/schema';
import { createApproxTokenizer, createExactTokenizer, type Tokenizer } from '@core/text';
import { createProvider, DEFAULT_PROVIDER_CONFIG, loadImageProvider } from '@adapters/providers';
import { DexieStorage } from '@adapters/storage';
import type { ImageProvider, Provider, Storage } from '@core/ports';
import { HashEmbedder, loadInBrowserEmbedder, ProviderEmbedder } from '@adapters/embeddings';
import { type Embedder } from '@core/ports';
import { NoopScriptRunner, type ScriptRunner } from '@core/ports';

/**
 * App-wide singletons. Kept out of React so the engine, workers and tests can
 * share them. `services.provider(id)` caches one Provider per config.
 */
export { DEFAULT_PROVIDER_CONFIG };
export const tokenizer = createApproxTokenizer();
export const storage: Storage = new DexieStorage();

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

// One slot, not a map: only one image server is configured at a time, and a Map keyed on the
// URL gained an entry per keystroke in the Image server field and never dropped one.
let imageCache: { key: string; provider: Promise<ImageProvider> } | undefined;

/** The configured image server, or undefined when See mode has nowhere to go. */
export function imageProviderFor(settings: AppSettings): Promise<ImageProvider> | undefined {
  const cfg = imageProvider(settings);
  if (!cfg) return undefined;
  const key = `${cfg.id}|${cfg.kind}|${cfg.baseUrl}`;
  if (imageCache?.key !== key) imageCache = { key, provider: loadImageProvider(cfg) };
  return imageCache.provider;
}

const exactTokenizers = new Map<string, Tokenizer>();

/** Exact cached counts when the backend has `/tokenize`, else the calibrated estimate. */
export function tokenizerFor(provider: Provider): Tokenizer {
  if (!provider.tokenize) return tokenizer;
  let t = exactTokenizers.get(provider.id);
  if (!t) {
    t = createExactTokenizer(tokenizer, async (text) => (await provider.tokenize?.(text))?.length ?? tokenizer.count(text));
    exactTokenizers.set(provider.id, t);
  }
  return t;
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

/**
 * The runner for one adventure. QuickJS and its wasm stay off the start-up path:
 * a story without scripts never loads the adapter. A failed compile throws, and
 * the session falls back to the no-op runner.
 */
export async function scriptsFor(adv: Adventure): Promise<ScriptRunner> {
  if (!hasScripts(adv.scripts)) return new NoopScriptRunner();
  const { createQuickJsRunner } = await import('@adapters/scripting');
  const runner = createQuickJsRunner();
  const { ok, error } = await runner.load(adv.scripts);
  if (!ok) {
    runner.dispose();
    throw new Error(error ?? 'the scenario scripts could not be compiled');
  }
  return runner;
}

/** Opens an adventure as a session wired to the app-wide services. */
export function openSession(adventure: Adventure, app: AppSettings): GameSession {
  return new GameSession(adventure, app, {
    providerFor,
    imageProviderFor,
    embedderFor,
    tokenizer,
    tokenizerFor,
    scriptsFor,
    storage,
    idle: (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn) : setTimeout(fn, 800)),
    frame: (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)),
    saveDelayMs: 300,
    rewarmDelayMs: 1000, // [provisional]
    // Well above the 130 s a 512²/24-step render takes with the story model on the same GPU
    // [measured: docs/measurements/2026-10-05-play-images.json], so only a hung server is killed.
    imageTimeoutMs: 300_000, // [provisional]
  });
}
