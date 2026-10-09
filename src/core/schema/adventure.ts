import { z } from 'zod/mini';
import { Action } from './action';
import { StoryCard } from './card';
import { Entity } from './entity';
import { Memory } from './memory';
import { AdventureSettings } from './settings';

/** Six parts of a day, not an hour clock: the model writes prose, not timestamps. [provisional] */
export const DayPart = z.enum(['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night']);

/** Where the story is now: maintained by memory jobs from the helper call, player-editable. */
export const Scene = z.object({
  location: z.optional(z.string()),
  /** Names, not entity ids: the player edits them as text. */
  present: z.array(z.string()),
  /** Absent until a passage states the time of day; then it moves only by stated elapsed time. */
  time: z.optional(z.object({ day: z.int(), part: DayPart })),
  weather: z.optional(z.string()),
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
  /** Sent as one `[Scene: …]` line beside the author's note. */
  scene: z.optional(Scene),
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
