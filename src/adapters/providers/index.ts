import type { ProviderConfig } from '@core/model';
import { ProviderError } from './http';
import { LlamaServerProvider } from './llamaServer';
import { OpenAICompatProvider } from './openaiCompat';
import type { Provider } from '@core/ports';

let demoHandler: ((req: Request) => Promise<Response>) | undefined;
/** Lazy so the demo code ships as its own chunk. */
const demoFetch: typeof fetch = async (input, init) => {
  demoHandler ??= (await import('./demo/fakeLlama')).createFakeLlama();
  return demoHandler(new Request(input, init));
};

/**
 * Build a Provider from its stored config. New backends register here.
 *
 * KoboldCpp and Ollama both speak the OpenAI completion API well enough for
 * milestone 1; dedicated adapters (KoboldCpp's /api/extra/generate/stream
 * with its own sampler set, Ollama's /api/generate with keep_alive) are
 * milestone-3 work.
 */
export function createProvider(cfg: ProviderConfig): Provider {
  switch (cfg.kind) {
    case 'demo':
      return new LlamaServerProvider(cfg.id, 'http://demo.invalid', demoFetch);
    case 'llama-server':
      return new LlamaServerProvider(cfg.id, cfg.baseUrl);
    case 'koboldcpp':
      return new OpenAICompatProvider(cfg.id, cfg.baseUrl, {
        supportsTopK: true,
      });
    case 'ollama':
      return new OpenAICompatProvider(cfg.id, cfg.baseUrl, {
        supportsTopK: false,
      });
    case 'a1111':
      // An image server speaks /sdapi/v1 only; see `A1111Provider` behind the ImageProvider port.
      throw new ProviderError('An image server cannot generate text');
    case 'openai-compat':
    default:
      return new OpenAICompatProvider(cfg.id, cfg.baseUrl);
  }
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  id: 'local',
  kind: 'llama-server',
  name: 'llama-server (localhost:8080)',
  baseUrl: 'http://localhost:8080',
  role: 'story',
};

export * from './http';
