/**
 * Inference provider abstraction. Every backend is a local HTTP server; the
 * app calls it directly from the browser (localhost is a secure context).
 *
 * Providers expose a *capability report* so the UI can grey out samplers a
 * backend cannot honour and the engine can decide whether to rely on prefix
 * caching, `/tokenize`, embeddings or grammar-constrained output.
 */

export interface ProviderCapabilities {
  streaming: boolean;
  topK: boolean;
  penalties: boolean;
  minP: boolean;
  repetitionPenalty: boolean;
  seed: boolean;
  /** Backend reuses KV cache for an unchanged prompt prefix. */
  prefixCache: boolean;
  /** Multiple generation slots (parallel requests) are available. */
  parallelSlots: number;
  tokenize: boolean;
  embeddings: boolean;
  grammar: boolean;
  jsonSchema: boolean;
  /** Provider can generate images itself (KoboldCpp with --sdmodel). */
  images: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  version?: string | undefined;
  modelId?: string | undefined;
  /** Context size loaded in the server, if it reports one. */
  contextSize?: number | undefined;
  slots?: number | undefined;
  message?: string;
}

export interface CompletionRequest {
  prompt: string;
  maxTokens: number;
  temperature: number;
  topK?: number | undefined;
  topP?: number | undefined;
  minP?: number | undefined;
  presencePenalty?: number | undefined;
  frequencyPenalty?: number | undefined;
  repetitionPenalty?: number | undefined;
  seed?: number | undefined;
  stop?: string[] | undefined;
  /** Ask the backend to reuse its KV cache for the common prefix. */
  cachePrompt?: boolean | undefined;
  /** Pin the request to a slot so its cache survives (llama-server). */
  slotId?: number | undefined;
  /** GBNF grammar (llama.cpp). */
  grammar?: string | undefined;
  /** JSON schema the output must satisfy. */
  jsonSchema?: Record<string, unknown> | undefined;
  /** Prefill only: process the prompt, generate nothing (cache warming). */
  prefillOnly?: boolean | undefined;
}

export interface CompletionStats {
  promptTokens?: number | undefined;
  cachedTokens?: number | undefined;
  generatedTokens?: number | undefined;
  promptMs?: number | undefined;
  generationMs?: number | undefined;
  stopReason?: 'stop' | 'length' | 'eos' | 'abort' | 'unknown';
}

export interface CompletionChunk {
  text: string;
  done: boolean;
  stats?: CompletionStats | undefined;
}

export interface Provider {
  readonly id: string;
  readonly kind: string;
  readonly baseUrl: string;
  health(signal?: AbortSignal): Promise<ProviderHealth>;
  capabilities(): Promise<ProviderCapabilities>;
  /** Streams text chunks; the last chunk has `done: true` and stats. */
  complete(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<CompletionChunk>;
  tokenize?(text: string, signal?: AbortSignal): Promise<number[]>;
  embed?(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

/** Collect a stream into a string (used for utility calls: summaries, cards). */
export async function collect(stream: AsyncIterable<CompletionChunk>): Promise<{ text: string; stats?: CompletionStats | undefined }> {
  let text = '';
  let stats: CompletionStats | undefined;
  for await (const c of stream) {
    text += c.text;
    if (c.done) stats = c.stats;
  }
  return { text, stats };
}
