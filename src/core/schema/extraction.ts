import { z } from 'zod/mini';
import { LOOK_KEYS } from '../memory/looks';
import { EntityKind } from './entity';
import { WEATHERS } from './weather';

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
/** A look, state or stance is a few words ("long grey braid"). [provisional] */
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
  // No `state`: the state read writes it each turn (M13-3). `to` is a name, or "You" for the player.
  relationships: z.optional(z.array(z.object({ to: Name, stance: sentence(LOOK_CHARS) })).check(z.maxLength(2))),
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

/** One word, so the scene line never carries "late-night traffic". `unchanged` keeps the last one, `none` clears it. [provisional] */
export const Weather = z.enum(['unchanged', 'none', ...WEATHERS]);
export const LOCATION_CHARS = 40;
/** The cast enum's one value when no character is known yet. */
export const NOBODY = 'nobody';
/** Where a character present before is at the end of the passage. */
export const STAYS = ['here', 'left', 'asleep'] as const;
const Stay = z.enum(STAYS);

/**
 * Where the passage ends; `scene.ts` resolves it. Every key required: optional, the 12B left keys out (R1).
 * Names are an enum of the cast, so the grammar cannot invent one; an empty cast is `nobody`.
 * [measured: 2026-10-13-state-probe-m12-dogfood P7c]
 */
export const sceneRead = (cast: readonly string[], before: readonly string[]) => {
  const [first = NOBODY, ...rest] = cast;
  // Capped: uncapped, the 12B repeated one name to the token cap when the enum lacked the ones it meant (dogfood M13-9).
  const who = z.array(z.enum([first, ...rest])).check(z.maxLength(rest.length + 1));
  // A required verdict per character present before: a free `left` list stayed empty in 0/13 replays of a move to another room (F14).
  const stay = z.object(Object.fromEntries(before.map((n) => [n, Stay])));
  return z.object({ location: sentence(LOCATION_CHARS), present: who, stay, weather: Weather });
};
export type SceneRead = z.output<ReturnType<typeof sceneRead>>;
/**
 * The turn read's reply; a turn with no new name asks only the scene. `scene` first and required:
 * optional and with no worked example, the 12B left it out. [measured: 2026-10-09-recall-m11-1.json]
 */
export const turnRead = (cast: readonly string[], newNames: readonly string[], before: readonly string[]) => {
  const [first, ...rest] = newNames;
  if (first === undefined) return z.object({ scene: sceneRead(cast, before) });
  // A card per asked name, at least one: a free list after the scene came back empty in 7 of 9 reads, 0 of 8 so. [measured: 2026-10-15-turn-read-cards.json]
  const card = z.object({ ...IntroducedEntity.shape, name: z.enum([first, ...rest]) });
  return z.object({ scene: sceneRead(cast, before), entities: z.array(card).check(z.minLength(1), z.maxLength(Math.min(MAX_INTRODUCED, newNames.length))) });
};

/** What the state read may change; `holds` becomes the item's `holder`. [measured: 2026-10-13-state-probe-m12-dogfood P8b] */
export const STATE_READ_KEYS = ['location', 'posture', 'condition', 'mood', 'wearing', 'holds'] as const;
/** A value padded to a longer cap ran the reply to its token cap (P8b). */
export const NOW_CHARS = 20;

/** One change the state read reports: whose, which key, the new value, and the [number] of the action that shows it. */
export const stateChange = (who: readonly [string, ...string[]]) =>
  z.object({ who: z.enum(who), key: z.enum(STATE_READ_KEYS), now: z.string().check(z.maxLength(NOW_CHARS)), at: z.int() });
export type StateChange = z.output<ReturnType<typeof stateChange>>;
/** The state read's reply. No optional keys (R1). */
export const stateRead = (who: readonly [string, ...string[]], max: number) => z.object({ changes: z.array(stateChange(who)).check(z.maxLength(max)) });

/**
 * The combined helper call's reply. No scene: it reads memories back, so it would move the scene
 * into the past. Short fields come first so a reply cut at `maxTokens` still has them; a cut loses
 * the last item of the list it fell in (see `extract.ts`). No rules: asking for them here took the
 * reply to its cap in 2 of 4 calls and cut facts 39 → 22. [measured: 2026-10-12-recall-m12-8-pr3-rules-d30.json]
 */
export const ExtractionJson = z.object({
  entities: z.array(ExtractedEntity).check(z.maxLength(MAX_ENTITIES)),
  speakers: z.array(SpokenIn),
});
