import { z } from 'zod/mini';

export const TemplateId = z.enum(['chatml', 'llama3', 'mistral', 'gemma', 'raw']);

// Defaults live here so parsing an older record fills in fields added since.
export const ModelSettings = z.object({
  /** Input budget in tokens (what the context builder may fill). */
  contextLength: z._default(z.int().check(z.gt(0)), 8192),
  /** Max tokens to generate per turn; ~11 s at 19 tok/s on a 12B. [measured: 2026-10-02-gate-v.md] */
  responseLength: z._default(z.int().check(z.gt(0)), 200),
  temperature: z._default(z.number(), 1.0),
  topK: z._default(z.number(), 250),
  topP: z._default(z.number(), 0.95),
  presencePenalty: z._default(z.number(), 0.25),
  frequencyPenalty: z._default(z.number(), 0),
  minP: z.optional(z.number()),
  repetitionPenalty: z.optional(z.number()),
  seed: z.optional(z.number()),
});

export const MemorySettings = z.object({
  autoSummary: z._default(z.boolean(), true),
  memoryBank: z._default(z.boolean(), true),
  /** Max memories kept per adventure (AID tiers: 25/100/200/400/800). */
  bankSize: z._default(z.int().check(z.gt(0)), 200),
});

export const ContextSettings = z.object({
  /** History before lore: keeps a byte-stable prefix for the backend's KV cache. Off = AI Dungeon's order. [measured: 2026-10-02-gatev-layout.json] */
  cacheStableLayout: z._default(z.boolean(), true),
  /** When trimming history, drop the oldest actions in blocks of this size. [measured: 2026-10-02-gatev-eviction.json] */
  evictionChunk: z._default(z.int().check(z.gt(0)), 8),
  /** Include the raw model output (no sentence trimming). */
  rawOutput: z._default(z.boolean(), false),
  /** Warn on the context meter when cards or plot components did not fit. */
  contextWarning: z._default(z.boolean(), true),
  /** After each turn, prefill the next turn's stable prefix. */
  cacheWarming: z._default(z.boolean(), true),
  /** After each turn, generate one retry alternative on a second slot (needs -np 2). */
  retryPrefetch: z._default(z.boolean(), false),
});

export const AdventureSettings = z.object({
  providerId: z._default(z.string(), 'local'),
  /** Model id as reported by the provider (e.g. GGUF file name). */
  modelId: z.optional(z.string()),
  template: z._default(TemplateId, 'chatml'),
  model: z.prefault(ModelSettings, {}),
  memory: z.prefault(MemorySettings, {}),
  context: z.prefault(ContextSettings, {}),
  textStyle: z._default(z.enum(['print', 'clean', 'hacker']), 'print'),
});

export const ProviderConfig = z.object({
  id: z.string(),
  kind: z.enum(['demo', 'llama-server', 'openai-compat', 'koboldcpp', 'ollama']),
  name: z.string(),
  baseUrl: z.string(),
  /** Optional: a second, small model server for summaries/cards/image prompts. */
  role: z.optional(z.enum(['story', 'utility'])),
  /** Prompt template of the model behind this server; the story provider uses the adventure's instead. */
  template: z.optional(TemplateId),
});

export const AppSettings = z.object({
  providers: z.array(ProviderConfig),
  defaultProviderId: z.string(),
  defaults: z.prefault(AdventureSettings, {}),
  theme: z._default(z.enum(['dark', 'light', 'sepia']), 'dark'),
  highContrast: z._default(z.boolean(), false),
  textAnimation: z._default(z.boolean(), true),
  textSize: z._default(z.enum(['default', 'large', 'larger']), 'default'),
  stickyInput: z._default(z.boolean(), true),
  compactButtons: z._default(z.boolean(), false),
});
