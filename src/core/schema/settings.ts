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
  /** Tokens the presence/frequency penalties look back over. 1536 starved function words into word salad; DRY covers the turn before. [measured: 2026-10-12-repetition-window-only.json] */
  repeatLastN: z._default(z.int(), 64),
  /** DRY strength (0 = off); the Wayfarer community preset. No effect on repeated phrases on two seeds; kept so stored defaults do not change. [measured: 2026-10-17-repetition-dry08-s7.json] */
  dryMultiplier: z._default(z.number().check(z.gte(0)), 0.8),
  seed: z.optional(z.number()),
  /** AID's "Dynamic" without weight swaps: each turn takes the next model preset's samplers instead of these. */
  dynamic: z._default(z.boolean(), false),
  /** Re-roll a reply that is empty, copies an earlier one or writes for the player, once per turn. [provisional] */
  autoRetry: z._default(z.boolean(), true),
});

export const MemorySettings = z.object({
  autoSummary: z._default(z.boolean(), true),
  memoryBank: z._default(z.boolean(), true),
  /** Max memories kept per adventure (AID tiers: 25/100/200/400/800). */
  bankSize: z._default(z.int().check(z.gt(0)), 200),
  /** After each turn, one helper call checks the output against the scene and locked values; a locked value present runs it anyway. Off until its precision is measured. */
  contradictionCheck: z._default(z.boolean(), false),
  /** Send now-lines and identities in the prompt: three present fit the cap. [measured: 2026-10-14-state-m13-5-cast.json] */
  entityFacts: z._default(z.boolean(), true),
  /** Cards for the names a turn brings, from the short call after each turn. */
  introductions: z._default(z.boolean(), true),
  /** The same call reads where the turn ends: place, who and which named items are there. */
  sceneEachTurn: z._default(z.boolean(), true),
  /** After the turn read, one call for what changed for whoever is there: every turn (never cut), only while idle (typing cuts it), or off. */
  stateRead: z._default(z.enum(['every', 'idle', 'off']), 'every'),
});

export const ContextSettings = z.object({
  /** History before lore: keeps a byte-stable prefix for the backend's KV cache. Off = AI Dungeon's order. [measured: 2026-10-02-gatev-layout.json] */
  cacheStableLayout: z._default(z.boolean(), true),
  /** When trimming history, drop the oldest actions in blocks of this size. [measured: 2026-10-02-gatev-eviction.json] */
  evictionChunk: z._default(z.int().check(z.gt(0)), 8),
  /** Include the raw model output (no sentence trimming). */
  rawOutput: z._default(z.boolean(), false),
  /** Tell the model the reply length in the Author's note, derived from `responseLength`. [provisional] */
  lengthHint: z._default(z.boolean(), true),
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
  /** Character portraits are rendered between turns when an image server is configured. */
  portraits: z._default(z.boolean(), true),
  /** Appended to every portrait prompt so they match; unset = derived from the adventure's tags. */
  portraitStyle: z.optional(z.string()),
  /** A portrait is shown at 32 CSS px, so it renders smaller and cheaper than a See image. [provisional] */
  portraitSize: z._default(z.int().check(z.gt(0)), 384),
  portraitSteps: z._default(z.int().check(z.gt(0)), 14),
  /** A1111 sampler name from the checkpoint's model card; unset = server default. */
  sampler: z.optional(z.string()),
  clipSkip: z.optional(z.int().check(z.gt(0))),
  /** A model page's "denoise": See and covers render, upscale and redraw at `hiresDenoise`. Portraits never do. Off until its time cost is measured. */
  hires: z._default(z.boolean(), false),
  // The usual 1.5x upscale, and a typical model page's 0.55 denoise. [provisional]
  hiresScale: z._default(z.number().check(z.gt(0)), 1.5),
  hiresDenoise: z._default(z.number().check(z.gt(0)), 0.55),
  hiresSteps: z.optional(z.int().check(z.gt(0))),
  /** Appended to every See, portrait and cover prompt: style, nudity or gore words the checkpoint needs. */
  promptSuffix: z.optional(z.string()),
});

/** The model-card part of `ImageSettings`: what an image preset sets. Size, checkpoint and portraits are left alone. */
export const ImagePresetSettings = z.object({
  sampler: z.optional(z.string()),
  clipSkip: z.optional(z.int().check(z.gt(0))),
  steps: z.int().check(z.gt(0)),
  cfgScale: z.number().check(z.gt(0)),
  hires: z.boolean(),
  hiresScale: z.optional(z.number().check(z.gt(0))),
  hiresDenoise: z.optional(z.number().check(z.gt(0))),
  hiresSteps: z.optional(z.int().check(z.gt(0))),
});

/** A preset the player saved; app-wide, so every adventure can apply it. */
export const ImagePreset = z.object({ id: z.string(), name: z.string(), settings: ImagePresetSettings });

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
  /** The content clause every system prompt carries; `custom` sends `contentText` instead (blank = none). */
  content: z._default(z.enum(['unrestricted', 'custom']), 'unrestricted'),
  contentText: z.optional(z.string()),
  /** Lines of the "Never write" box; an output containing one is flagged for a retry. Not a sampler: llama-server's string bias bans every token of a phrase. */
  bannedPhrases: z._default(z.array(z.string()), []),
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
  // 'light' was a second name for the sepia token block; stored values migrate instead of failing the parse.
  theme: z._default(
    z.pipe(
      z.enum(['dark', 'light', 'sepia', 'slate', 'dynamic']),
      z.transform((t) => (t === 'light' ? ('sepia' as const) : t)),
    ),
    'dark',
  ),
  highContrast: z._default(z.boolean(), false),
  textAnimation: z._default(z.boolean(), true),
  /** The speaker's portrait beside dialogue paragraphs. */
  speakerAvatars: z._default(z.boolean(), true),
  textSize: z._default(z.enum(['default', 'large', 'larger']), 'default'),
  speech: z.prefault(SpeechSettings, {}),
  stickyInput: z._default(z.boolean(), true),
  compactButtons: z._default(z.boolean(), false),
  imagePresets: z._default(z.array(ImagePreset), []),
  /** Helper reads with a utility model configured: `story` never uses it, `utility` always, `bench` per `READ_MODEL`. [provisional] */
  readsOn: z._default(z.enum(['story', 'utility', 'bench']), 'bench'),
});
