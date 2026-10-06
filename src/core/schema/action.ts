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
  /** Present for `see` actions. `imageId` points at a stored blob; `url` only comes from imported AID data. `missing`: the blob did not come with the import. */
  image: z.optional(
    z.object({
      imageId: z.optional(z.string()),
      url: z.optional(z.string()),
      prompt: z.string(),
      model: z.optional(z.string()),
      missing: z.optional(z.literal(true)),
    }),
  ),
  stats: z.optional(GenerationStats),
  /** The turn that produced this action; links it to its `TurnTrace`. */
  turnId: z.optional(z.string()),
  /**
   * Who speaks in which paragraph of the active text (blank-line split), by entity name. Dropped when
   * the active text changes; an edit that keeps the version only mis-indexes a label. Absent = not read yet.
   */
  speakers: z.optional(z.array(z.object({ paragraph: z.int(), name: z.string() }))),
});
