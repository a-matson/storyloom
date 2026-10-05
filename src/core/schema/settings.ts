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

/** See mode's txt2img parameters; all defaults [provisional] (SDXL-sized square, cheap step count). */
export const ImageSettings = z.object({
  model: z.optional(z.string()),
  // SD 1.5's native size, and 4x faster than 768²: 1m58s against 8m44s on an M2 Pro.
  // [measured: docs/measurements/2026-10-05-live-images.json]
  width: z._default(z.int().check(z.gt(0)), 512),
  height: z._default(z.int().check(z.gt(0)), 512),
  steps: z._default(z.int().check(z.gt(0)), 24),
  cfgScale: z._default(z.number().check(z.gt(0)), 5),
  negativePrompt: z.optional(z.string()),
});

export const AdventureSettings = z.object({
  providerId: z._default(z.string(), 'local'),
  /** Model id as reported by the provider (e.g. GGUF file name). */
  modelId: z.optional(z.string()),
  template: z._default(TemplateId, 'chatml'),
  model: z.prefault(ModelSettings, {}),
  memory: z.prefault(MemorySettings, {}),
  context: z.prefault(ContextSettings, {}),
  image: z.prefault(ImageSettings, {}),
  textStyle: z._default(z.enum(['print', 'clean', 'hacker']), 'print'),
});

export const ProviderConfig = z.object({
  id: z.string(),
  kind: z.enum(['demo', 'llama-server', 'openai-compat', 'koboldcpp', 'ollama', 'a1111']),
  name: z.string(),
  baseUrl: z.string(),
  /** Optional: a second, small model server for summaries/cards/image prompts, or the image server. */
  role: z.optional(z.enum(['story', 'utility', 'image'])),
  /** Prompt template of the model behind this server; the story provider uses the adventure's instead. */
  template: z.optional(TemplateId),
});

/** Read-aloud via the platform `speechSynthesis`; `voiceUri` unset means the system default. */
export const SpeechSettings = z.object({
  enabled: z._default(z.boolean(), false),
  voiceUri: z.optional(z.string()),
});

export const AppSettings = z.object({
  providers: z.array(ProviderConfig),
  defaultProviderId: z.string(),
  defaults: z.prefault(AdventureSettings, {}),
  theme: z._default(z.enum(['dark', 'light', 'sepia', 'slate', 'dynamic']), 'dark'),
  highContrast: z._default(z.boolean(), false),
  textAnimation: z._default(z.boolean(), true),
  textSize: z._default(z.enum(['default', 'large', 'larger']), 'default'),
  speech: z.prefault(SpeechSettings, {}),
  stickyInput: z._default(z.boolean(), true),
  compactButtons: z._default(z.boolean(), false),
});
