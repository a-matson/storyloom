import { z } from 'zod/mini';

/** A standing truth of the world ("Kobolds fear fire"), sent while one of its gates is relevant. */
export const Rule = z.object({
  id: z.string(),
  text: z.string(),
  /** Entity ids (characters, places, items, factions); empty = always sent. */
  gates: z.array(z.string()),
  source: z.enum(['player', 'story']),
  /** A story proposal waits for the player; only confirmed rules reach the prompt. */
  status: z.enum(['proposed', 'confirmed']),
  createdAt: z.number(),
  /** Action index it was made at. */
  fromAction: z.int().check(z.gte(0)),
});
