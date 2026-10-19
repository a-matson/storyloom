import { z } from 'zod/mini';
import { Action } from './action';
import { Assertion } from './assertion';
import { StoryCard } from './card';
import { Entity, EntityKind, LegacyEntity } from './entity';
import { Memory } from './memory';
import { Rule } from './rule';
import { AdventureSettings } from './settings';

/** Six parts of a day, not an hour clock: the model writes prose, not timestamps. [provisional] */
export const DayPart = z.enum(['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night']);

/** How hot the scene runs: it filters beats, shortens the length hint and raises dice DCs. [provisional] */
export const Tension = z.enum(['quiet', 'tense', 'action']);

/** Where the story is now: maintained by memory jobs from the helper call, player-editable. */
export const Scene = z.object({
  /** A place's entity id, else the place as written (`sceneIds`). */
  location: z.optional(z.string()),
  /** Character entity ids, else names nothing is known as; `sceneNames` shows them. */
  present: z.array(z.string()),
  /** A present character's id → the room of this place they are in, as written; absent: in yours. */
  zones: z.optional(z.record(z.string(), z.string())),
  /** The player's room in this place, as written; absent: the place itself. Set by a read naming a room of it, or `/travel`. */
  zone: z.optional(z.string()),
  /** Factions with members here: a faction's entity id, else its name as written; `count` when the passage gives one. Never in `present`. */
  groups: z.optional(z.array(z.object({ id: z.string(), count: z.optional(z.int()) }))),
  /** Set only by the player (`/wait`, `/time`, the Scene fields); no read writes it. */
  time: z.optional(z.object({ day: z.int(), part: DayPart })),
  weather: z.optional(z.string()),
  /** Set only by the player (`/tension`, the Scene fields) or a drawn complication; no read writes it. */
  tension: z.optional(Tension),
  /** Named items there, as written. */
  items: z.optional(z.array(z.string())),
  /** Action index of the last location change. */
  since: z.optional(z.int()),
  /** The last action the scene was read from; cleared when that action's text changes. */
  sourceId: z.optional(z.string()),
  sourceHash: z.optional(z.string()),
});

/** Always-on prompt pieces ("Plot Components"). All optional. */
export const PlotComponents = z.object({
  /** Sent as the system prompt. */
  aiInstructions: z.optional(z.string()),
  /** Maintained by auto-summarisation, hand-editable. */
  storySummary: z.optional(z.string()),
  /** Formerly "Memory": key facts always in context. */
  plotEssentials: z.optional(z.string()),
  /** Short style/tone guidance injected near the end of the prompt. */
  authorsNote: z.optional(z.string()),
  /** Replace "You" in Do/Say actions with a character name. */
  thirdPerson: z.optional(z.object({ enabled: z.boolean(), name: z.string() })),
  /** The player's own record; what they wrote about themselves is assertions on subject `you`. A free string, so "other" pronouns need no migration. */
  you: z.optional(z.object({ pronouns: z.optional(z.string()) })),
  /** Sent as one `[Scene: …]` line beside the author's note. */
  scene: z.optional(Scene),
  /** One entry per location change, newest last. */
  sceneLog: z.optional(z.array(z.object({ at: z.int(), location: z.string() }))),
  /** One entry per change of who is present (ids), newest last; the cast's witnessed-by clauses read it. */
  presence: z.optional(z.array(z.object({ at: z.int(), present: z.array(z.string()) }))),
  /** `/chapter` marks and chapter titles by start action; `seen: false` is a helper's proposed title. */
  chapters: z.optional(z.array(z.object({ at: z.int(), title: z.optional(z.string()), seen: z.optional(z.boolean()) }))),
});

/** `state.memory` in the scripting API: overrides for plot essentials / author's note, plus front memory. */
export const ScriptMemory = z.object({
  context: z.optional(z.string()),
  authorsNote: z.optional(z.string()),
  frontMemory: z.optional(z.string()),
});

/** The four script hooks. Defined here, not in `./scenario`, so `Adventure` can hold a copy without an import cycle. */
export const ScenarioScripts = z.object({ library: z.string(), input: z.string(), context: z.string(), output: z.string() });

const Placeholder = z.object({ question: z.string(), answer: z.string() });

const Keyed = z.optional(z.record(z.string(), z.optional(z.string())));

/** A reply entity as it arrived, with the range it was read from. Loose: the grammar's caps are not a stored record's. */
const HeldEntity = z.object({
  entity: z.object({
    name: z.string(),
    kind: EntityKind,
    description: z.string(),
    aliases: z.optional(z.array(z.string())),
    facts: z.array(z.string()),
    looks: Keyed,
    state: Keyed,
    relationships: z.optional(z.array(z.object({ to: z.string(), stance: z.string() }))),
  }),
  range: z.object({ fromAction: z.number(), toAction: z.number() }),
});

/** Persistent object scripts read/write (`state`); scripts may add any keys, so unknown keys are kept. */
export const ScriptState = z.looseObject({
  memory: z.optional(ScriptMemory),
  message: z.optional(z.string()),
  placeholders: z.optional(z.array(Placeholder)),
  /** Action count at the last Story Summary refresh (memory jobs). */
  __summaryAt: z.optional(z.number()),
  /** `toAction` of the newest memory whose entities were extracted (memory jobs). */
  __entitiesAt: z.optional(z.number()),
  /** Action count, and a hash of the last action's text, at the last introduction call (memory jobs). */
  __introducedAt: z.optional(z.number()),
  __introducedHash: z.optional(z.string()),
  /** The same, at the last state read (memory jobs). */
  __stateAt: z.optional(z.number()),
  __stateHash: z.optional(z.string()),
  /** An action the summary read was edited or erased: rebuild it from the memories. */
  __summaryDirty: z.optional(z.boolean()),
  /** A place the turn read made while the scene was at `inside`: the Scene section asks whether it is part of it. */
  __placeAsk: z.optional(z.object({ place: z.string(), inside: z.string() })),
  /** Entities the batch call named once, held until a second mention makes their card (memory jobs). */
  __pending: z.optional(z.array(HeldEntity)),
  /** A new name a known one's spelling (Weaver for Weever): the player says whether it is that entity (`of`, an id). Its reply waits in `__pending`. */
  __aliasProposals: z.optional(z.array(z.object({ name: z.string(), of: z.string(), at: z.number() }))),
  /** Characters the player nudged (entity ids) at log length `at`: their confirmed goal goes on the next turn's now-line. */
  __nudge: z.optional(z.array(z.object({ id: z.string(), at: z.number() }))),
});

export const CardGeneratorSettings = z.object({
  speedCreate: z.boolean(),
  includeSummary: z.boolean(),
  logToNotes: z.boolean(),
  aiInstructions: z.string(),
  storyInformation: z.string(),
});

export const Adventure = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  coverUrl: z.optional(z.string()),
  /** Image id of the cover blob, stored under this adventure's id. `coverUrl` is read-only legacy for imported data. */
  coverId: z.optional(z.string()),
  scenarioId: z.optional(z.string()),
  /** Active path of the story, in order. */
  actions: z.array(Action),
  plot: PlotComponents,
  storyCards: z.array(StoryCard),
  memories: z.array(Memory),
  /** Characters, places, items and factions extracted by memory maintenance; stored records predating them parse as none. */
  entities: z.prefault(z.array(Entity), []),
  /** Kept on the adventure record: a few dozen short lines, saved with it. */
  rules: z.prefault(z.array(Rule), []),
  /** Typed facts about the entities; an adventure saved before the store derives them once (`migrateEntities`). */
  assertions: z.prefault(z.array(Assertion), []),
  scriptState: ScriptState,
  /** Copied from the scenario at creation, so later scenario edits never change a running story. */
  scripts: z.optional(ScenarioScripts),
  /** Answers given to ${placeholders} when the adventure was created. */
  placeholders: z.array(Placeholder),
  settings: z.prefault(AdventureSettings, {}),
  /** Story-card generator settings; per adventure, like AI Dungeon. */
  cardGenerator: z.optional(CardGeneratorSettings),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** A stored or exported adventure that may predate the assertion store: `migrateEntities` moves its entity facts. */
export const LegacyAdventure = z.object({ ...Adventure.shape, entities: z.prefault(z.array(LegacyEntity), []) });
