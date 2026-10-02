import { ensureOk, fetchJson, sseEvents } from './http';
import { OpenAiCompletionEvent, OpenAiEmbeddings, OpenAiModels } from './schemas';
import { type CompletionChunk, type CompletionRequest, type Provider, type ProviderCapabilities, type ProviderHealth } from '@core/ports';

/**
 * Generic OpenAI-compatible provider (LM Studio, vLLM, TabbyAPI, KoboldCpp's
 * /v1 endpoints, Ollama's /v1 endpoints, llama-server's /v1).
 *
 * Uses /v1/completions (raw prompt) so the app's own chat template is what the
 * model sees. Sampler support varies by server; the capability report is
 * conservative and the UI hides what isn't supported.
 */
export class OpenAICompatProvider implements Provider {
  readonly kind = 'openai-compat';
  private modelName: string | undefined;

  readonly id: string;
  readonly baseUrl: string;
  private readonly opts: { model?: string; apiKey?: string; supportsTopK?: boolean };
  private readonly fetchFn: typeof fetch;

  constructor(
    id: string,
    baseUrl: string,
    opts: { model?: string; apiKey?: string; supportsTopK?: boolean } = {},
    fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {
    this.fetchFn = fetchFn;
    this.id = id;
    this.baseUrl = baseUrl;
    this.opts = opts;
    this.modelName = opts.model;
  }

  private url(path: string): string {
    return this.baseUrl.replace(/\/$/, '') + path;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.opts.apiKey) h['authorization'] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const json = await fetchJson(this.fetchFn, this.url('/v1/models'), OpenAiModels, { headers: this.headers() }, signal);
      const first = json.data?.[0]?.id;
      if (!this.modelName) this.modelName = first;
      return { ok: true, modelId: this.modelName };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return {
      streaming: true,
      topK: this.opts.supportsTopK ?? false,
      penalties: true,
      minP: false,
      repetitionPenalty: false,
      seed: true,
      prefixCache: false,
      parallelSlots: 1,
      tokenize: false,
      embeddings: true,
      grammar: false,
      jsonSchema: false,
      images: false,
    };
  }

  async *complete(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<CompletionChunk> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt: req.prompt,
      max_tokens: req.prefillOnly ? 1 : req.maxTokens,
      temperature: req.temperature,
      top_p: req.topP ?? 1,
      presence_penalty: req.presencePenalty ?? 0,
      frequency_penalty: req.frequencyPenalty ?? 0,
      stop: req.stop ?? [],
      stream: true,
    };
    if (req.seed !== undefined) body['seed'] = req.seed;
    if (this.opts.supportsTopK && req.topK) body['top_k'] = req.topK;

    const res = await this.fetchFn(this.url('/v1/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: signal ?? null,
    });
    ensureOk(res, '/v1/completions');
    let finish: string | undefined;
    for await (const e of sseEvents(res, OpenAiCompletionEvent, signal)) {
      const choice = e.choices?.[0];
      if (choice?.text) yield { text: choice.text, done: false };
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (e.usage) {
        yield {
          text: '',
          done: true,
          stats: { promptTokens: e.usage.prompt_tokens, generatedTokens: e.usage.completion_tokens, stopReason: finish === 'length' ? 'length' : 'stop' },
        };
        return;
      }
    }
    yield { text: '', done: true, stats: { stopReason: finish === 'length' ? 'length' : 'stop' } };
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const json = await fetchJson(
      this.fetchFn,
      this.url('/v1/embeddings'),
      OpenAiEmbeddings,
      { method: 'POST', headers: this.headers(), body: JSON.stringify({ model: this.modelName, input: texts }) },
      signal,
    );
    return json.data.map((d) => d.embedding);
  }
}
