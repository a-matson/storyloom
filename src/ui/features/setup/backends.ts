import type { AppSettings, ProviderConfig } from '@core/model';
import type { ProviderCapabilities } from '@core/ports';

export const BACKENDS: { kind: ProviderConfig['kind']; name: string; blurb: string; url: string }[] = [
  { kind: 'demo', name: 'Demo (no GPU)', blurb: 'Canned prose to try the app. No model needed.', url: 'demo' },
  { kind: 'llama-server', name: 'llama-server', blurb: 'Recommended. All samplers, prefix cache, tokenize, grammar.', url: 'http://localhost:8080' },
  { kind: 'koboldcpp', name: 'KoboldCpp', blurb: 'One binary; text plus built-in image generation.', url: 'http://localhost:5001' },
  { kind: 'ollama', name: 'Ollama', blurb: 'Easiest install. Set OLLAMA_ORIGINS for the browser.', url: 'http://localhost:11434' },
  { kind: 'openai-compat', name: 'OpenAI-compatible', blurb: 'LM Studio, vLLM, TabbyAPI: /v1/completions.', url: 'http://localhost:1234' },
];

export const CAPABILITIES: { key: keyof ProviderCapabilities; label: string }[] = [
  { key: 'streaming', label: 'streaming' },
  { key: 'topK', label: 'top-k' },
  { key: 'penalties', label: 'penalties' },
  { key: 'prefixCache', label: 'prefix cache' },
  { key: 'tokenize', label: 'tokenize' },
  { key: 'grammar', label: 'grammar / JSON' },
  { key: 'embeddings', label: 'embeddings' },
  { key: 'images', label: 'images' },
];

export const THEMES: { value: AppSettings['theme']; label: string }[] = [
  { value: 'dark', label: 'Dark (Lantern & Ink)' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'light', label: 'Light' },
];
