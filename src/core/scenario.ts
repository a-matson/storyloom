import type { Adventure, AdventureSettings, Scenario, StoryCard } from './types';
import { DEFAULT_ADVENTURE_SETTINGS, newId } from './types';
import { applyPlaceholders, findPlaceholders } from './placeholders';

/**
 * Scenario → Adventure. The prompt becomes the first action ("start"); plot
 * components, cards and scripts are copied so the adventure is independent
 * of later scenario edits (AI Dungeon semantics).
 */
export function placeholderQuestions(s: Scenario) {
  return findPlaceholders([
    s.prompt,
    s.plot.aiInstructions,
    s.plot.plotEssentials,
    s.plot.authorsNote,
    s.plot.storySummary,
    ...s.storyCards.flatMap((c) => [c.entry, c.triggers.join(','), c.notes]),
  ]);
}

export function createAdventureFromScenario(
  s: Scenario,
  answers: Record<string, string>,
  settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS,
  selectedCards: StoryCard[] = [],
): Adventure {
  const sub = (t: string | undefined) => (t ? applyPlaceholders(t, answers) : t);
  const cards: StoryCard[] = s.storyCards.map((c) => ({
    ...c,
    id: newId('card_'),
    entry: applyPlaceholders(c.entry, answers),
    triggers: c.triggers.map((t) => applyPlaceholders(t, answers)),
    notes: sub(c.notes),
  }));
  const now = Date.now();
  const prompt = applyPlaceholders(s.prompt, answers).trim();
  const characterIntro = selectedCards.length ? `\n\n${selectedCards.map((c) => c.entry).join('\n')}` : '';
  return {
    id: newId('adv_'),
    title: s.title,
    description: s.description,
    tags: [...s.tags],
    coverUrl: s.coverUrl,
    scenarioId: s.id,
    actions: prompt
      ? [{ id: newId('act_'), type: 'start', versions: [prompt + characterIntro], active: 0, createdAt: now }]
      : [],
    plot: {
      aiInstructions: sub(s.plot.aiInstructions),
      storySummary: sub(s.plot.storySummary),
      plotEssentials: sub(s.plot.plotEssentials),
      authorsNote: sub(s.plot.authorsNote),
      thirdPerson: s.plot.thirdPerson ? { ...s.plot.thirdPerson } : undefined,
    },
    storyCards: cards,
    memories: [],
    scriptState: { placeholders: Object.entries(answers).map(([question, answer]) => ({ question, answer })) },
    placeholders: Object.entries(answers).map(([question, answer]) => ({ question, answer })),
    settings: structuredClone(settings),
    createdAt: now,
    updatedAt: now,
  };
}

/** A blank adventure from a free-text opening (Quick Start / "Surprise me"). */
export function createBlankAdventure(title: string, opening: string, settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS): Adventure {
  const scenario: Scenario = {
    id: newId('scn_'),
    title,
    description: '',
    tags: [],
    type: 'story',
    prompt: opening,
    plot: {
      aiInstructions:
        'You are the narrator of an interactive story. Write in second person, present tense. Describe what the player sees, hears and feels. ' +
        'Keep scenes moving. Never decide what the player does or says.',
    },
    storyCards: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const adv = createAdventureFromScenario(scenario, {}, settings);
  adv.scenarioId = undefined;
  return adv;
}

export const QUICK_STARTS: { title: string; tag: string; opening: string }[] = [
  {
    title: 'Fantasy',
    tag: 'fantasy',
    opening:
      'You are a hedge-witch in the mountain town of Corrow, where the snow has not melted in three summers. This morning a rider from the valley collapsed at your door with a sealed letter and frost on the inside of his eyelids.',
  },
  {
    title: 'Mystery',
    tag: 'mystery',
    opening:
      'You are a night clerk at the Hotel Marlowe. At 2:14 a.m. the elevator arrives at the lobby, empty, holding a single wet umbrella. It has not rained in a week.',
  },
  {
    title: 'Sci-fi',
    tag: 'sci-fi',
    opening:
      'You are the only crew member awake on the freighter Anselm, six months from anywhere. The ship woke you early. It will not say why, and the cargo manifest has gained an entry that was not there when you slept.',
  },
  {
    title: 'Slice of life',
    tag: 'slice-of-life',
    opening:
      'You run a two-table noodle shop under the railway arches. It is raining, the last train has gone, and the regular who never talks has just asked if you have a minute.',
  },
];
