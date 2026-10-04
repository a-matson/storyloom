import { z } from 'zod/mini';

// Only the fields we read; unknown fields are dropped, missing optional ones are fine.
const num = z.optional(z.number());
const str = z.optional(z.string());

export const LlamaProps = z.object({
  default_generation_settings: z.optional(z.object({ n_ctx: num })),
  total_slots: num,
  model_path: str,
  model_alias: str,
  build_info: str,
});

export const LlamaCompletionEvent = z.object({
  content: str,
  stop: z.optional(z.boolean()),
  stop_type: str,
  tokens_predicted: num,
  tokens_evaluated: num,
  tokens_cached: num,
  // `tokens_cached` is the whole slot cache after the request, not the reused prefix; `cache_n` is.
  timings: z.optional(z.object({ prompt_ms: num, predicted_ms: num, prompt_n: num, predicted_n: num, cache_n: num })),
});
export type LlamaCompletionEvent = z.output<typeof LlamaCompletionEvent>;

export const LlamaApplied = z.object({ prompt: z.string() });
export const LlamaTokenize = z.object({ tokens: z.array(z.number()) });
const Embedding = z.object({ embedding: z.array(z.number()) });
/** Older builds return an object, newer ones an array. */
export const LlamaEmbedding = z.union([z.array(Embedding), Embedding]);
export const LlamaHealth = z.object({ status: z.string() });

/** A1111-compatible image server: checkpoint list and base64 PNGs. */
export const A1111Models = z.array(z.object({ title: str, model_name: str }));
export const A1111Txt2Img = z.object({ images: z.array(z.string()) });

export const OpenAiModels = z.object({ data: z.optional(z.array(z.object({ id: z.string() }))) });
export const OpenAiCompletionEvent = z.object({
  choices: z.optional(z.array(z.object({ text: str, finish_reason: z.optional(z.nullable(z.string())) }))),
  usage: z.optional(z.object({ prompt_tokens: num, completion_tokens: num })),
});
export const OpenAiEmbeddings = z.object({ data: z.array(Embedding) });
