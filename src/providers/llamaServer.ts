import { fetchJson, readSse, type CompletionChunk, type CompletionRequest, type Provider, type ProviderCapabilities, type ProviderHealth } from './types';

/**
 * llama.cpp `llama-server` provider — the reference backend.
 *
 * Endpoints used:
 *   GET  /health       → { status: "ok" }
 *   GET  /props        → { default_generation_settings: { n_ctx }, total_slots, model_path, ... }
 *   POST /completion   → SSE stream of { content, stop, ... , timings }
 *   POST /tokenize     → { tokens: number[] }
 *   POST /embedding    → [{ embedding: number[] }] (needs --embedding)
 *
 * Start it with something like:
 *   llama-server -m Harbinger-24B-Q4_K_M.gguf -c 16384 -ngl 99 -fa on -ctk q8_0 -ctv q8_0 \
 *     --port 8080 -np 2 --path ./dist
 */
export class LlamaServerProvider implements Provider {
  readonly kind = 'llama-server';
  private caps: ProviderCapabilities | null = null;
  private props: LlamaProps | null = null;

  readonly id: string;
  readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(id: string, baseUrl: string, fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }

  private url(path: string): string {
    return this.baseUrl.replace(/\/$/, '') + path;
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      await fetchJson<{ status: string }>(this.url('/health'), {}, signal, this.fetchFn);
      const props = await this.getProps(signal);
      const modelId = props.model_path?.split(/[\\/]/).pop() ?? props.model_alias ?? undefined;
      return {
        ok: true,
        modelId,
        contextSize: props.default_generation_settings?.n_ctx,
        slots: props.total_slots,
        version: props.build_info,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  private async getProps(signal?: AbortSignal): Promise<LlamaProps> {
    if (this.props) return this.props;
    this.props = await fetchJson<LlamaProps>(this.url('/props'), {}, signal, this.fetchFn);
    return this.props;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    if (this.caps) return this.caps;
    let slots = 1;
    let embeddings = false;
    try {
      const props = await this.getProps();
      slots = props.total_slots ?? 1;
      // llama-server only serves /embedding when started with --embedding;
      // probe once so the memory bank can prefer server-side embeddings.
      try {
        const res = await this.fetchFn(this.url('/embedding'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: 'probe' }),
        });
        embeddings = res.ok;
      } catch {
        embeddings = false;
      }
    } catch {
      // keep defaults
    }
    this.caps = {
      streaming: true,
      topK: true,
      penalties: true,
      minP: true,
      repetitionPenalty: true,
      seed: true,
      prefixCache: true,
      parallelSlots: slots,
      tokenize: true,
      embeddings,
      grammar: true,
      jsonSchema: true,
      images: false,
    };
    return this.caps;
  }

  async *complete(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<CompletionChunk> {
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      n_predict: req.prefillOnly ? 0 : req.maxTokens,
      temperature: req.temperature,
      top_k: req.topK ?? 0,
      top_p: req.topP ?? 1,
      min_p: req.minP ?? 0,
      presence_penalty: req.presencePenalty ?? 0,
      frequency_penalty: req.frequencyPenalty ?? 0,
      repeat_penalty: req.repetitionPenalty ?? 1,
      stop: req.stop ?? [],
      cache_prompt: req.cachePrompt ?? true,
      stream: !req.prefillOnly,
    };
    if (req.seed !== undefined) body['seed'] = req.seed;
    if (req.slotId !== undefined) body['id_slot'] = req.slotId;
    if (req.grammar) body['grammar'] = req.grammar;
    if (req.jsonSchema) body['json_schema'] = req.jsonSchema;

    const res = await this.fetchFn(this.url('/completion'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? null,
    });
    if (!res.ok) throw new Error(`llama-server /completion → ${res.status} ${res.statusText}`);

    if (req.prefillOnly) {
      const json = (await res.json()) as LlamaCompletionEvent;
      yield { text: '', done: true, stats: statsOf(json) };
      return;
    }

    for await (const evt of readSse(res, signal)) {
      const e = evt as LlamaCompletionEvent;
      const text = e.content ?? '';
      if (e.stop) {
        yield { text, done: true, stats: statsOf(e) };
        return;
      }
      if (text) yield { text, done: false };
    }
    yield { text: '', done: true, stats: { stopReason: 'unknown' } };
  }

  async tokenize(text: string, signal?: AbortSignal): Promise<number[]> {
    const json = await fetchJson<{ tokens: number[] }>(
      this.url('/tokenize'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text }),
      },
      signal,
      this.fetchFn,
    );
    return json.tokens;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      const json = await fetchJson<{ embedding: number[] }[] | { embedding: number[] }>(
        this.url('/embedding'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: t }),
        },
        signal,
        this.fetchFn,
      );
      const first = Array.isArray(json) ? json[0] : json;
      out.push(first?.embedding ?? []);
    }
    return out;
  }
}

interface LlamaProps {
  default_generation_settings?: { n_ctx?: number };
  total_slots?: number;
  model_path?: string;
  model_alias?: string;
  build_info?: string;
}

interface LlamaCompletionEvent {
  content?: string;
  stop?: boolean;
  stopped_eos?: boolean;
  stopped_word?: boolean;
  stopped_limit?: boolean;
  tokens_predicted?: number;
  tokens_evaluated?: number;
  tokens_cached?: number;
  timings?: {
    prompt_ms?: number;
    predicted_ms?: number;
    prompt_n?: number;
    predicted_n?: number;
  };
}

function statsOf(e: LlamaCompletionEvent) {
  return {
    promptTokens: e.timings?.prompt_n ?? e.tokens_evaluated,
    cachedTokens: e.tokens_cached,
    generatedTokens: e.timings?.predicted_n ?? e.tokens_predicted,
    promptMs: e.timings?.prompt_ms,
    generationMs: e.timings?.predicted_ms,
    stopReason: e.stopped_eos ? ('eos' as const) : e.stopped_word ? ('stop' as const) : e.stopped_limit ? ('length' as const) : ('unknown' as const),
  };
}
