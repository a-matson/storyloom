import type { AppSettings } from '@core/model';
import { DEFAULT_ADVENTURE_SETTINGS } from '@core/model';
import { createApproxTokenizer } from '@core/text';
import { createProvider, DEFAULT_PROVIDER_CONFIG } from '@adapters/providers';
import { DexieStorage } from '@adapters/storage';
import type { Provider, Storage } from '@core/ports';
import { HashEmbedder, ProviderEmbedder } from '@adapters/embeddings';
import { type Embedder } from '@core/ports';
import { NoopScriptRunner } from '@core/ports';

/**
 * App-wide singletons. Kept out of React so the engine, workers and tests can
 * share them. `services.provider(id)` caches one Provider per config.
 */
export const tokenizer = createApproxTokenizer();
export const storage: Storage = new DexieStorage();
export const scripts = new NoopScriptRunner();

const providers = new Map<string, Provider>();
const embedders = new Map<string, Embedder>();

export const DEFAULT_APP_SETTINGS: AppSettings = {
  providers: [DEFAULT_PROVIDER_CONFIG],
  defaultProviderId: DEFAULT_PROVIDER_CONFIG.id,
  defaults: DEFAULT_ADVENTURE_SETTINGS,
  theme: 'dark',
  highContrast: false,
  textAnimation: true,
  textSize: 'default',
  stickyInput: true,
  compactButtons: false,
};

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

/** Prefer server-side embeddings when the backend offers them; otherwise the hashing fallback. */
export async function embedderFor(provider: Provider): Promise<Embedder> {
  const key = provider.id;
  const cached = embedders.get(key);
  if (cached) return cached;
  let e: Embedder = new HashEmbedder();
  try {
    const caps = await provider.capabilities();
    if (caps.embeddings && provider.embed) {
      const fn = provider.embed.bind(provider);
      e = new ProviderEmbedder(fn, 0, `${provider.id}-embed`);
    }
  } catch {
    // fall through to hash
  }
  embedders.set(key, e);
  return e;
}

export function applyTheme(s: AppSettings, textStyle: 'print' | 'clean' | 'hacker' = 'print'): void {
  const root = document.documentElement;
  root.dataset['theme'] = s.theme;
  root.dataset['contrast'] = s.highContrast ? 'high' : 'normal';
  root.dataset['textSize'] = s.textSize;
  root.dataset['textStyle'] = textStyle;
}
