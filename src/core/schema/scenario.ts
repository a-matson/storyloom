import { z } from 'zod/mini';
import { PlotComponents } from './adventure';
import { StoryCard } from './card';

export const ScenarioType = z.enum(['story', 'characterCreator', 'multipleChoice']);

export const ScenarioScripts = z.object({ library: z.string(), input: z.string(), context: z.string(), output: z.string() });

export const Scenario = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  coverUrl: z.optional(z.string()),
  type: ScenarioType,
  /** The first action of a new adventure. May contain ${placeholders}. */
  prompt: z.string(),
  plot: PlotComponents,
  storyCards: z.array(StoryCard),
  scripts: z.optional(ScenarioScripts),
  /** Multiple choice: child scenarios, each a full scenario. */
  get options() {
    return z.optional(z.array(Scenario));
  },
  parentId: z.optional(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
