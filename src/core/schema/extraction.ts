import { z } from 'zod/mini';
import { LOOK_KEYS, STATE_KEYS } from '../memory/looks';
import { EntityKind } from './entity';

// Not re-exported from `./index`: only the lazy memory jobs parse these, so they stay off the start-up bundle.

/** Five entities of two facts fit the call's 300 tokens. [measured: 2026-10-08-recall-wave2-run1.json] */
export const MAX_ENTITIES = 5;

/**
 * Caps the grammar enforces. Without a worked example the 12B ran one description past the whole
 * 300-token reply ("…, and is …, and is …"). A value that reaches its cap was cut: `uncut` trims it.
 * A word-cap pattern compiles, but the 12B met it by gluing the words ("offeringcomfortingwords…").
 * [measured: 2026-10-11 Wayfarer-2-12B json_schema probe] [provisional]
 */
export const FACT_CHARS = 100;
export const DESCRIPTION_CHARS = 120;
/** A look or state is a few words per key ("long grey braid"). [provisional] */
export const LOOK_CHARS = 40;
const sentence = (chars: number) => z.string().check(z.maxLength(chars));

// The grammar then cannot write "the path": prompting alone did not stop common nouns filling the cap.
// ponytail: ASCII capitals only; widen when a non-Latin story needs it.
const Name = z.string().check(z.regex(/^[A-Z][^"\\]*$/)); // llama-server's `.` would let the grammar close the string early

/** Optional values by fixed keys, so a new value replaces one key instead of piling up sentences. */
const keyed = (keys: readonly string[]) => z.object(Object.fromEntries(keys.map((k) => [k, z.optional(sentence(LOOK_CHARS))])));

/** One entity as the helper model reports it. */
export const ExtractedEntity = z.object({
  name: Name,
  kind: EntityKind,
  aliases: z.optional(z.array(z.string())),
  // Required and capped so the grammar keeps a reply short and every projected card has an entry. [provisional]
  description: sentence(DESCRIPTION_CHARS),
  // Before the keyed fields, which the grammar writes in this order: behind them the 12B proposed 10 facts at d30, not 15. [provisional]
  facts: z.array(sentence(FACT_CHARS)).check(z.maxLength(2)),
  /** Optional: required, every entity wrote looks (factions too) and each reply hit the 300-token cap. [provisional] */
  looks: z.optional(keyed(LOOK_KEYS)),
  state: z.optional(keyed(STATE_KEYS)),
});

/** Who speaks in which numbered action. */
export const SpokenIn = z.object({ action: z.number(), name: z.string() });

/** New names one introduction reply covers; a turn rarely brings more. [provisional] */
export const MAX_INTRODUCED = 3;
export const INTRODUCED_CHARS = 100;

/**
 * The introduction call's reply: only what a new card needs. The full reply (scene, speakers, facts)
 * took ~28 s on slot 1, longer than a player reads, so the next turn cut it. [measured: 2026-10-09-live-play-m11-2-read30.json]
 */
export const IntroducedEntity = z.object({
  name: Name,
  kind: EntityKind,
  description: sentence(INTRODUCED_CHARS),
  looks: ExtractedEntity.shape.looks,
});

/** Where the passage ends, as the helper writes it; `scene.ts` cleans and resolves it. */
export const TurnScene = z.object({
  location: z.optional(z.string()),
  present: z.optional(z.array(z.string())),
  items: z.optional(z.array(z.string())),
  weather: z.optional(z.string()),
});
/** A turn with no new name asks only this. */
export const SceneJson = z.object({ scene: TurnScene });
/**
 * The turn read's reply. `scene` first and required: optional and with no worked example, the 12B
 * left it out. [measured: 2026-10-09-recall-m11-1.json]
 */
export const IntroductionJson = z.object({ scene: TurnScene, entities: z.array(IntroducedEntity).check(z.maxLength(MAX_INTRODUCED)) });

/**
 * The combined helper call's reply. No scene: it reads memories back, so it would move the scene
 * into the past. Short fields come first so a reply cut at `maxTokens` still has them; a cut loses
 * the last item of the list it fell in (see `extract.ts`).
 */
export const ExtractionJson = z.object({
  entities: z.array(ExtractedEntity).check(z.maxLength(MAX_ENTITIES)),
  speakers: z.array(SpokenIn),
});
