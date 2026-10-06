import { z } from 'zod/mini';

export const EntityKind = z.enum(['character', 'place', 'item', 'faction']);

const count = z.int().check(z.gte(0));
export const Relation = z.object({ to: z.string(), label: z.string() });

export const EntityFact = z.object({
  id: z.string(),
  text: z.string(),
  /** Action index the fact was learned at. */
  fromAction: count,
  source: z.enum(['memory', 'player', 'card']),
  /** Kept and preferred over model output. */
  pinned: z.optional(z.boolean()),
  conflict: z.optional(z.boolean()),
});

/** A character, place, item or faction the story has named, built up from the memory cycle's helper call. */
export const Entity = z.object({
  id: z.string(),
  kind: EntityKind,
  name: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  facts: z.array(EntityFact),
  /** Current values (location, condition, ...); an overwrite keeps the old value as a fact. */
  state: z.record(z.string(), z.string()),
  relations: z.array(Relation),
  /** Action indexes. */
  firstSeen: count,
  lastSeen: count,
  portraitId: z.optional(z.string()),
  cardId: z.optional(z.string()),
  canon: z.optional(z.boolean()),
});
