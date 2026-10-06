import { z } from 'zod/mini';
import { EntityKind, Relation } from './entity';

// Not re-exported from `./index`: only the lazy memory jobs parse these, so they stay off the start-up bundle.

/** One entity as the helper model reports it. */
export const ExtractedEntity = z.object({
  // The grammar then cannot write "the path": prompting alone did not stop common nouns filling the cap.
  // ponytail: ASCII capitals only; widen when a non-Latin story needs it.
  name: z.string().check(z.regex(/^[A-Z][^"\\]*$/)), // llama-server's `.` would let the grammar close the string early
  kind: EntityKind,
  aliases: z.optional(z.array(z.string())),
  // Required and capped so the grammar keeps a reply short and every projected card has an entry. [provisional]
  description: z.string(),
  facts: z.array(z.string()).check(z.maxLength(3)),
  state: z.optional(z.record(z.string(), z.string())),
  relations: z.optional(z.array(Relation)),
});

/**
 * The combined helper call's reply (also sent as llama-server `json_schema`, which keeps this key
 * order). Short fields come first so a reply cut at `maxTokens` still has them; `entities` is the
 * long one, and the trailing `speakers` may be lost to a cut (see `extract.ts`).
 */
export const ExtractionJson = z.object({
  importance: z.int().check(z.gte(1), z.lte(5)),
  /** Story time that passed in the passage, in words ("an hour", "three days"). */
  timeDelta: z.optional(z.string()),
  entities: z.array(ExtractedEntity).check(z.maxLength(8)),
  /** Who speaks in which numbered action. */
  speakers: z.array(z.object({ action: z.number(), name: z.string() })),
  /** Open threads the passage starts or advances. */
  threads: z.optional(z.array(z.string())),
});
