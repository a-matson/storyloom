import { z } from 'zod/mini';

/** An AI-written summary of a run of six actions, embedded for retrieval. */
export const Memory = z.object({
  id: z.string(),
  text: z.string(),
  /** Inclusive start / exclusive end index into the action log at creation time. */
  fromAction: z.int().check(z.gte(0)),
  toAction: z.int().check(z.gte(0)),
  /** Action ids covered, so edits can mark the memory stale. */
  actionIds: z.array(z.string()),
  embedding: z.optional(z.array(z.number())),
  useCount: z.int().check(z.gte(0)),
  createdAt: z.number(),
  lastUsedAt: z.optional(z.number()),
  stale: z.optional(z.boolean()),
  /** Evicted from the bank but kept, so its range is not summarised again. */
  forgotten: z.optional(z.boolean()),
  /** The player's: never evicted, ranked first. */
  pinned: z.optional(z.boolean()),
});
