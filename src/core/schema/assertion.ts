import { z } from 'zod/mini';

const index = z.int().check(z.gte(0));

/** Fields every assertion carries: who it is about, who made it, and where in the story it came from. */
const common = {
  id: z.string(),
  /** Entity id, or `you` for the player. */
  subject: z.string(),
  /** `legacy`: derived from an entity fact made before the store existed. */
  producer: z.enum(['turn', 'batch', 'player', 'card', 'rule', 'legacy']),
  /** Action index it was read from. */
  at: index,
  paragraph: z.optional(index),
  /** The words of that action it rests on; an edit that removes them drops it. */
  span: z.optional(z.string()),
  basis: z.enum(['stated', 'inferred', 'player', 'legacy']),
  /** Action index it became true at. */
  since: index,
  /** Action index it stopped being true at; absent while current. */
  until: z.optional(index),
  pinned: z.optional(z.boolean()),
  /** False: a proposal the player has not looked at. */
  seen: z.optional(z.boolean()),
};

/**
 * One typed thing the story says about an entity. Keys stay free strings: stored facts carry keys
 * outside `LOOK_KEYS`/`STATE_READ_KEYS`, and a stricter enum would make those saves unreadable.
 */
export const Assertion = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('identity'), text: z.string() }),
  z.object({ ...common, kind: z.literal('trait'), text: z.string() }),
  /** A `LOOK_KEYS` value, or `legacy` for the old free-text appearance. */
  z.object({ ...common, kind: z.literal('look'), key: z.string(), value: z.string() }),
  z.object({ ...common, kind: z.literal('state'), key: z.string(), value: z.string() }),
  z.object({
    ...common,
    kind: z.literal('effect'),
    condition: z.string(),
    cause: z.optional(z.object({ kind: z.enum(['item', 'rule', 'character', 'you']), id: z.optional(z.string()), text: z.string() })),
  }),
  /** `to` is a name (or `you`), as the story wrote it. */
  z.object({ ...common, kind: z.literal('relationship'), to: z.string(), stance: z.string() }),
  /** The story claimed a value for a key the player locked. */
  z.object({ ...common, kind: z.literal('conflict'), key: z.string(), claimed: z.string(), canon: z.string() }),
  /** A fact the player marked secret (`subject: you`, `at` = the marked action); `knownBy` = entity ids plus `you`. */
  z.object({ ...common, kind: z.literal('secret'), text: z.string(), knownBy: z.array(z.string()) }),
]);
