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
  /** On a conflict: the state value the story claimed, so "Accept the story" can apply it. */
  claim: z.optional(z.object({ key: z.string(), value: z.string() })),
  /** The action it came from: an edit that removes `evidence` (else changes the text, `sourceHash`) drops it. */
  sourceId: z.optional(z.string()),
  sourceHash: z.optional(z.string()),
  evidence: z.optional(z.string()),
  /** Absent: `basisOf` derives it from `source`. */
  basis: z.optional(z.enum(['stated', 'inferred', 'player'])),
  /** Absent: `trait`. A `state` is `key` → `value`, ended (`until`) when a new value for its key arrives. */
  kind: z.optional(z.enum(['trait', 'state', 'effect', 'relationship'])),
  key: z.optional(z.string()),
  value: z.optional(z.string()),
  /** Action index the value stopped being true at; absent while current. */
  until: z.optional(count),
  /** An effect's source: what put the condition (`value`) on the entity. */
  cause: z.optional(z.object({ kind: z.enum(['item', 'rule', 'character', 'you']), id: z.optional(z.string()), text: z.string() })),
});

/** A character, place, item or faction the story has named, built up from the memory cycle's helper call. */
export const Entity = z.object({
  id: z.string(),
  kind: EntityKind,
  name: z.string(),
  aliases: z.array(z.string()),
  /** What the story calls it in place of the name ("the kobold"), lower-case, newest last; name lookups read them. Absent: none. */
  roles: z.optional(z.array(z.string())),
  /** A canon or carded entity's card text; empty for others, whose identity is an assertion. */
  description: z.string(),
  relations: z.array(Relation),
  /** A place's id of the place it is inside (a room in a house): moving between them is no change of place. */
  partOf: z.optional(z.string()),
  /** A place's links to other places, read both ways; `via` is what the way goes through ("the hall"). */
  connectedTo: z.optional(z.array(z.object({ id: z.string(), via: z.optional(z.string()) }))),
  /** Action indexes. */
  firstSeen: count,
  lastSeen: count,
  portraitId: z.optional(z.string()),
  /** `hashPrompt` of the looks a drawn portrait was drawn from; unset for an uploaded one. */
  portraitBasis: z.optional(z.string()),
  /** A See action's `imageId` the player chose as this character's reference; dropped with that blob. */
  referenceImageId: z.optional(z.string()),
  /** The looks by key frozen when the reference was set: later See prompts repeat them. A string is one frozen before M29-9. */
  look: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
  /** The builder's final sheet: owned like `portraitId`, replaced on a rebuild, dropped with the entity. */
  sheetImageId: z.optional(z.string()),
  cardId: z.optional(z.string()),
  /** Seeded from a scenario card: model output never replaces its name, kind or description. */
  canon: z.optional(z.boolean()),
  /** State keys the player locked: a model overwrite keeps the value and records a conflict. */
  canonKeys: z.optional(z.array(z.string())),
  /** A character's repertoire (`BEATS` ids or free text), newest last. `[]`: none; absent: the genre default, computed, never written. */
  beats: z.optional(z.array(z.string())),
});

/** An entity as stored before the assertion store (M13-2): only the migration reads these fields. */
// Not `z.extend(Entity, …)`: React Refresh reads `Name = f(Name, …)` as a component HOC and breaks the script worker.
export const LegacyEntity = z.object({
  ...Entity.shape,
  /** Free-text looks, set once. */
  appearance: z.optional(z.string()),
  facts: z.optional(z.array(EntityFact)),
  /** Values the player set (and legacy model ones); a current state fact of the same key overrides it. */
  state: z.optional(z.record(z.string(), z.string())),
});
