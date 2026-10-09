import { z } from 'zod/mini';
import { EntityKind, Relation } from './entity';

// Not re-exported from `./index`: only the lazy memory jobs parse these, so they stay off the start-up bundle.

/** Five entities of two facts fit the call's 300 tokens. [measured: 2026-10-08-recall-wave2-run1.json] */
export const MAX_ENTITIES = 5;

/**
 * Caps the grammar enforces. Without a worked example the 12B ran one description past the whole
 * 300-token reply ("…, and is …, and is …"). [provisional]
 */
const sentence = (chars: number) => z.string().check(z.maxLength(chars));

/** One entity as the helper model reports it. */
export const ExtractedEntity = z.object({
  // The grammar then cannot write "the path": prompting alone did not stop common nouns filling the cap.
  // ponytail: ASCII capitals only; widen when a non-Latin story needs it.
  name: z.string().check(z.regex(/^[A-Z][^"\\]*$/)), // llama-server's `.` would let the grammar close the string early
  kind: EntityKind,
  aliases: z.optional(z.array(z.string())),
  // Required and capped so the grammar keeps a reply short and every projected card has an entry. [provisional]
  description: sentence(120),
  /**
   * One visual sentence for the portrait prompt. Optional: required, every entity wrote looks
   * (factions too) and each reply hit the 300-token cap, losing entities. [provisional]
   */
  appearance: z.optional(sentence(120)),
  facts: z.array(sentence(100)).check(z.maxLength(2)),
  state: z.optional(z.record(z.string(), z.string())),
  relations: z.optional(z.array(Relation)),
});

/** New names one introduction reply covers; a turn rarely brings more. [provisional] */
export const MAX_INTRODUCED = 3;

/**
 * The introduction call's reply: only what a new card needs. The full reply (scene, speakers, facts)
 * took ~28 s on slot 1, longer than a player reads, so the next turn cut it. [measured: 2026-10-09-live-play-m11-2-read30.json]
 */
export const IntroducedEntity = z.object({
  name: ExtractedEntity.shape.name,
  kind: EntityKind,
  description: sentence(100),
  appearance: z.optional(sentence(100)),
});
export const IntroductionJson = z.object({ entities: z.array(IntroducedEntity).check(z.maxLength(MAX_INTRODUCED)) });

/**
 * The combined helper call's reply (also sent as llama-server `json_schema`, which keeps this key
 * order). Short fields come first so a reply cut at `maxTokens` still has them; `entities` is the
 * long one, and the trailing `speakers` may be lost to a cut (see `extract.ts`).
 */
export const ExtractionJson = z.object({
  /**
   * Where the passage ends. Required so the grammar asks for it: optional and with no worked
   * example, the 12B left it out (the `timeDelta` lesson again). [measured: 2026-10-09-recall-m11-1.json]
   */
  scene: z.object({
    location: z.optional(z.string()),
    present: z.optional(z.array(z.string())),
    weather: z.optional(z.string()),
  }),
  entities: z.array(ExtractedEntity).check(z.maxLength(MAX_ENTITIES)),
  /** Who speaks in which numbered action. */
  speakers: z.array(z.object({ action: z.number(), name: z.string() })),
});
