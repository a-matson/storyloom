import { z } from 'zod/mini';

export const StoryCard = z.object({
  id: z.string(),
  /** Character | Class | Race | Location | Faction | custom string. Not seen by the AI. */
  type: z.string(),
  /** For the player only; the AI never sees it. */
  name: z.string(),
  /** What the AI sees, prefixed by "World Lore:" in context. */
  entry: z.string(),
  /** Case-insensitive substrings; sensitive to leading/trailing spaces. */
  triggers: z.array(z.string()),
  /** Never sent to the AI (except as an option description in Character Creator). */
  notes: z.optional(z.string()),
  /** Character Creator: whether players can pick this card. */
  selectable: z.optional(z.boolean()),
});
