import type { Adventure, AdventureSettings, Entity, Scenario, StoryCard } from './types';
import { DEFAULT_ADVENTURE_SETTINGS, hasScripts, newId, scriptCount } from './types';
import { applyPlaceholders, findPlaceholders } from '../text/placeholders';
import { seedCanonEntities } from '../memory/canon';

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

/** Library card counts. */
export function scenarioSummary(s: Scenario) {
  return {
    type: s.type,
    placeholders: placeholderQuestions(s).length,
    cards: s.storyCards.length,
    branches: s.options?.length ?? 0,
    scripts: scriptCount(s.scripts),
  };
}

/** Question keys still unanswered (trimmed empty), in question order. All answers are required. [provisional] */
export function missingAnswers(questions: { key: string }[], answers: Record<string, string>): string[] {
  return questions.filter((q) => !answers[q.key]?.trim()).map((q) => q.key);
}

/**
 * `picked` are ids of selectable cards (Character Creator). Unpicked selectable
 * cards are not copied [provisional]; picked entries follow the prompt in the
 * start action, which is what stays when no AI opening can be written.
 */
export function createAdventureFromScenario(
  s: Scenario,
  rawAnswers: Record<string, string>,
  settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS,
  picked: string[] = [],
): Adventure {
  const answers = Object.fromEntries(Object.entries(rawAnswers).map(([k, v]) => [k, v.trim()]));
  const sub = (t: string | undefined) => (t ? applyPlaceholders(t, answers) : t);
  const creator = s.type === 'characterCreator';
  const kept = (c: StoryCard) => !creator || !c.selectable || picked.includes(c.id);
  const cardIds = new Map(s.storyCards.filter(kept).map((c) => [c.id, newId('card_')]));
  const cards: StoryCard[] = s.storyCards.filter(kept).map((c) =>
    Object.assign(structuredClone(c), {
      id: cardIds.get(c.id) ?? c.id,
      entry: applyPlaceholders(c.entry, answers),
      triggers: c.triggers.map((t) => applyPlaceholders(t, answers)),
      notes: sub(c.notes),
    }),
  );
  const now = Date.now();
  const prompt = applyPlaceholders(s.prompt, answers).trim();
  const chosen = creator ? cards.filter((c) => c.selectable) : [];
  const characterIntro = chosen.length ? `\n\n${chosen.map((c) => c.entry).join('\n')}` : '';
  // The world's ids are already this record's own (renumbered when it was saved or imported); its card links follow the new cards.
  const world = structuredClone(s.world ?? { entities: [], assertions: [], rules: [] });
  const entities: Entity[] = world.entities.map(({ cardId, ...e }) => {
    const card = cardId && cardIds.get(cardId);
    return card ? { ...e, cardId: card } : e;
  });
  const linked = new Set(entities.map((e) => e.cardId));
  return {
    id: newId('adv_'),
    title: s.title,
    description: s.description,
    tags: [...s.tags],
    coverUrl: s.coverUrl,
    scenarioId: s.id,
    actions: prompt ? [{ id: newId('act_'), type: 'start', versions: [prompt + characterIntro], active: 0, createdAt: now }] : [],
    plot: {
      aiInstructions: sub(s.plot.aiInstructions),
      storySummary: sub(s.plot.storySummary),
      plotEssentials: sub(s.plot.plotEssentials),
      authorsNote: sub(s.plot.authorsNote),
      thirdPerson: s.plot.thirdPerson ? { ...s.plot.thirdPerson } : undefined,
    },
    storyCards: cards,
    scripts: hasScripts(s.scripts) ? { ...s.scripts } : undefined,
    memories: [],
    entities: [
      ...entities,
      ...seedCanonEntities(
        cards.filter((c) => !linked.has(c.id)),
        0,
      ),
    ],
    rules: world.rules,
    // The world's; with none, derived from the canon entities on the first save.
    assertions: world.assertions,
    scriptState: { placeholders: Object.entries(answers).map(([question, answer]) => ({ question, answer })) },
    placeholders: Object.entries(answers).map(([question, answer]) => ({ question, answer })),
    settings: structuredClone(settings),
    createdAt: now,
    updatedAt: now,
  };
}

/** Default system prompt for blank stories and new scenarios. [provisional] */
export const DEFAULT_AI_INSTRUCTIONS =
  'You are the narrator of an interactive story. Write in second person, present tense. Describe what the player sees, hears and feels. ' +
  'Keep scenes moving. Never decide what the player does or says.';

/** An empty story scenario, ready for the editor. */
export function newScenario(title = '', prompt = ''): Scenario {
  const now = Date.now();
  return {
    id: newId('scn_'),
    title,
    description: '',
    tags: [],
    type: 'story',
    prompt,
    plot: { aiInstructions: DEFAULT_AI_INSTRUCTIONS },
    storyCards: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** A blank adventure from a free-text opening (Quick Start / "Surprise me"). */
export function createBlankAdventure(
  title: string,
  opening: string,
  settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS,
  scripts?: Scenario['scripts'],
): Adventure {
  const adv = createAdventureFromScenario({ ...newScenario(title, opening), scripts }, {}, settings);
  delete adv.scenarioId;
  return adv;
}

/** `dice`: starts with `DICE_SCRIPTS` (`@core/dice`, loaded on demand: start-up bundle budget). */
export const QUICK_STARTS: { title: string; tag: string; opening: string; dice?: boolean }[] = [
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
  {
    title: 'Consequences (dice)',
    tag: 'dice',
    opening:
      'You are a sellsword on the last night of a bad contract. The gate of Halven keep is barred, the wall beside it is slick with rain, and somewhere above, the man who owes you forty crowns is counting them.',
    dice: true,
  },
];
