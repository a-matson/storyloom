import { z } from 'zod/mini';
import { Action } from './action';
import { StoryCard } from './card';
import { Entity } from './entity';
import { Memory } from './memory';
import { AdventureSettings } from './settings';

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
