import { z } from 'zod/mini';

export const ActionType = z.enum(['start', 'continue', 'do', 'say', 'story', 'see']);

/** Statistics captured from the provider for a generated action. */
export const GenerationStats = z.object({
  model: z.optional(z.string()),
  promptTokens: z.optional(z.number()),
  cachedTokens: z.optional(z.number()),
  generatedTokens: z.optional(z.number()),
  promptMs: z.optional(z.number()),
  generationMs: z.optional(z.number()),
});

/**
 * One entry in the adventure's action log. `versions` holds every text this action has had
 * (retry alternatives and edits); `active` points at the one shown and sent to the AI.
 */
export const Action = z.object({
  id: z.string(),
  type: ActionType,
  versions: z.array(z.string()),
  active: z.int().check(z.gte(0)),
  createdAt: z.number(),
  /** Present for `see` actions (image generation). */
  image: z.optional(z.object({ url: z.string(), prompt: z.string(), model: z.optional(z.string()) })),
  stats: z.optional(GenerationStats),
  /** The turn that produced this action; links it to its `TurnTrace`. */
  turnId: z.optional(z.string()),
});
