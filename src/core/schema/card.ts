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

/** What the story card generator asks the model to return (also sent as llama-server `json_schema`). */
export const GeneratedCardJson = z.object({
  name: z.string(),
  entry: z.string(),
  triggers: z.array(z.string()).check(z.minLength(1), z.maxLength(8)),
});

/** What models actually return: AID-style aliases (title/description/keys), triggers as array or CSV. */
export const LooseCardJson = z.object({
  name: z.optional(z.string()),
  title: z.optional(z.string()),
  entry: z.optional(z.string()),
  description: z.optional(z.string()),
  triggers: z.optional(z.union([z.array(z.unknown()), z.string()])),
  keys: z.optional(z.union([z.array(z.unknown()), z.string()])),
});
