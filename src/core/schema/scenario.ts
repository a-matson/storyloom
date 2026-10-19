import { z } from 'zod/mini';
import { PlotComponents, ScenarioScripts } from './adventure';
import { Assertion } from './assertion';
import { StoryCard } from './card';
import { Entity } from './entity';
import { Rule } from './rule';

export const ScenarioType = z.enum(['story', 'characterCreator', 'multipleChoice']);

/** What a saved adventure's world carries into new ones (`worldOf`); one story's play (states, events, effects) stays behind. */
export const ScenarioWorld = z.object({ entities: z.array(Entity), assertions: z.array(Assertion), rules: z.array(Rule) });

export const Scenario = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  coverUrl: z.optional(z.string()),
  /** Image id of the cover blob, stored under this scenario's id. */
  coverId: z.optional(z.string()),
  type: ScenarioType,
  /** The first action of a new adventure. May contain ${placeholders}. */
  prompt: z.string(),
  plot: PlotComponents,
  storyCards: z.array(StoryCard),
  scripts: z.optional(ScenarioScripts),
  world: z.optional(ScenarioWorld),
  /** Applied over the app defaults when an adventure starts (`MEMORY_PRESETS`). */
  memoryPreset: z.optional(z.enum(['sliceOfLife', 'adventure'])),
  /** Multiple choice: child scenarios, each a full scenario. */
  get options() {
    return z.optional(z.array(Scenario));
  },
  parentId: z.optional(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
