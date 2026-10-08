import { z } from 'zod/mini';
import { DayPart } from './adventure';
import { EntityKind, Relation } from './entity';

// Not re-exported from `./index`: only the lazy memory jobs parse these, so they stay off the start-up bundle.

/** Five entities of two facts fit the call's 300 tokens. [measured: 2026-10-08-recall-wave2-run1.json] */
export const MAX_ENTITIES = 5;

/** One entity as the helper model reports it. */
export const ExtractedEntity = z.object({
  // The grammar then cannot write "the path": prompting alone did not stop common nouns filling the cap.
  // ponytail: ASCII capitals only; widen when a non-Latin story needs it.
  name: z.string().check(z.regex(/^[A-Z][^"\\]*$/)), // llama-server's `.` would let the grammar close the string early
  kind: EntityKind,
  aliases: z.optional(z.array(z.string())),
  // Required and capped so the grammar keeps a reply short and every projected card has an entry. [provisional]
  description: z.string(),
  facts: z.array(z.string()).check(z.maxLength(2)),
  state: z.optional(z.record(z.string(), z.string())),
  relations: z.optional(z.array(Relation)),
});

/**
 * The combined helper call's reply (also sent as llama-server `json_schema`, which keeps this key
 * order). Short fields come first so a reply cut at `maxTokens` still has them; `entities` is the
 * long one, and the trailing `speakers` may be lost to a cut (see `extract.ts`).
 */
export const ExtractionJson = z.object({
  /**
   * Story time the passage states has passed; zeros mean none. A part is a sixth of a day. Required
   * so the grammar forces two numbers: optional, the 12B left it out every time. [provisional]
   */
  timeDelta: z.object({ days: z.int().check(z.gte(0)), parts: z.int().check(z.gte(0)) }),
  /** Where the passage ends. `timeOfDay` only anchors a scene that has no clock yet. */
  scene: z.optional(
    z.object({
      location: z.optional(z.string()),
      present: z.optional(z.array(z.string())),
      timeOfDay: z.optional(DayPart),
      weather: z.optional(z.string()),
    }),
  ),
  entities: z.array(ExtractedEntity).check(z.maxLength(MAX_ENTITIES)),
  /** Who speaks in which numbered action. */
  speakers: z.array(z.object({ action: z.number(), name: z.string() })),
});
