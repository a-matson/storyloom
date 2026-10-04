import { ensureOk, fetchJson, sseEvents } from './http';
import { LlamaApplied, LlamaCompletionEvent, LlamaEmbedding, LlamaHealth, LlamaProps, LlamaTokenize } from './schemas';
import type { z } from 'zod/mini';
import { type CompletionChunk, type CompletionRequest, type Provider, type ProviderCapabilities, type ProviderHealth } from '@core/ports';

/**
 * llama.cpp `llama-server` provider — the reference backend.
 *
 * Endpoints used:
 *   GET  /health       → { status: "ok" }
 *   GET  /props        → { default_generation_settings: { n_ctx }, total_slots, model_path, ... }
 *   POST /completion   → SSE stream of { content, stop, ... , timings }
 *   POST /tokenize     → { tokens: number[] }
 *   POST /embedding    → [{ embedding: number[] }] (needs --embedding)
 *   POST /apply-template → { prompt } (Setup's template check only)
 *
 * Start it with something like:
 *   llama-server -m Harbinger-24B-Q4_K_M.gguf -c 16384 -ngl 99 -fa on -ctk q8_0 -ctv q8_0 \
 *     --port 8080 -np 2 --path ./dist
 */
/** Min matching chunk (tokens) llama-server may shift into place. Evicted turn: 46 -> 2225 of 2398 cached. [measured: 2026-10-02-gate-v.md] */
const CACHE_REUSE_CHUNK = 64;

export class LlamaServerProvider implements Provider {
  readonly kind = 'llama-server';
  private caps: ProviderCapabilities | null = null;
  private props: z.output<typeof LlamaProps> | null = null;

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
      await fetchJson(this.fetchFn, this.url('/health'), LlamaHealth, {}, signal);
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

  private async getProps(signal?: AbortSignal): Promise<z.output<typeof LlamaProps>> {
    if (this.props) return this.props;
    this.props = await fetchJson(this.fetchFn, this.url('/props'), LlamaProps, {}, signal);
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
      // History eviction drops the prompt's head; KV shifting reuses the rest instead of a full re-prefill.
      n_cache_reuse: CACHE_REUSE_CHUNK,
      stream: !req.prefillOnly,
      // A soft stop cancels the stream before the final event, so stats must ride on every chunk.
      timings_per_token: true,
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
    ensureOk(res, 'llama-server /completion');

    if (req.prefillOnly) {
      const r = LlamaCompletionEvent.safeParse(await res.json());
      yield { text: '', done: true, stats: r.success ? statsOf(r.data) : { stopReason: 'unknown' } };
      return;
    }

    for await (const e of sseEvents(res, LlamaCompletionEvent, signal)) {
      const text = e.content ?? '';
      if (e.stop) {
        yield { text, done: true, stats: statsOf(e) };
        return;
      }
      if (text) yield { text, done: false, stats: e.timings && statsOf(e) };
    }
    yield { text: '', done: true, stats: { stopReason: 'unknown' } };
  }

  async tokenize(text: string, signal?: AbortSignal): Promise<number[]> {
    const json = await fetchJson(
      this.fetchFn,
      this.url('/tokenize'),
      LlamaTokenize,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text }) },
      signal,
    );
    return json.tokens;
  }

  async applyTemplate(messages: { role: 'system' | 'user'; content: string }[], signal?: AbortSignal): Promise<string> {
    const json = await fetchJson(
      this.fetchFn,
      this.url('/apply-template'),
      LlamaApplied,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) },
      signal,
    );
    return json.prompt;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      const json = await fetchJson(
        this.fetchFn,
        this.url('/embedding'),
        LlamaEmbedding,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: t }) },
        signal,
      );
      const first = Array.isArray(json) ? json[0] : json;
      out.push(first?.embedding ?? []);
    }
    return out;
  }
}

function statsOf(e: z.output<typeof LlamaCompletionEvent>) {
  const t = e.timings;
  // `prompt_n` counts only newly evaluated tokens; the full prompt is reused + evaluated.
  const total = t?.cache_n !== undefined && t.prompt_n !== undefined ? t.cache_n + t.prompt_n : e.tokens_evaluated;
  return {
    promptTokens: total,
    cachedTokens: t?.cache_n,
    generatedTokens: e.timings?.predicted_n ?? e.tokens_predicted,
    promptMs: e.timings?.prompt_ms,
    generationMs: e.timings?.predicted_ms,
    stopReason: STOP_TYPES[e.stop_type ?? ''] ?? ('unknown' as const),
  };
}

const STOP_TYPES: Record<string, 'eos' | 'stop' | 'length' | undefined> = { eos: 'eos', word: 'stop', limit: 'length' };
