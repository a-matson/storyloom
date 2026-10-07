/**
 * The fact table and scoring for the recall benchmark (`pnpm measure recall <url>`).
 * Lives here, not in `e2e/live/`, so Playwright's `testMatch: 'live/**'` does not pick it up.
 */
import { newScenario, type Scenario } from '@core/model';
import { MORE_FACTS } from './recallFacts';

export type FactClass = 'character' | 'place' | 'canon';
export type PlantMode = 'Do' | 'Say' | 'card' | 'essentials';
export type Verdict = 'honoured' | 'absent' | 'contradicted';

export interface SeededFact {
  id: string;
  class: FactClass;
  /** How the fact enters the story. `card` and `essentials` are planted before turn 1. */
  plant: [mode: PlantMode, text: string];
  /** For `plant[0] === 'card'`; the entry is `plant[1]`. Character/Location/Faction cards seed a canon entity. */
  card?: { name: string; type: string; triggers: string };
  /** The turn that invites the model to use or contradict the fact. */
  probe: [mode: 'Do' | 'Say', text: string];
  /** The truth, for the helper-model judgement. */
  statement: string;
  /** Aliases and keywords that mean the fact was honoured; also the retrieval-hit probe. */
  expect: string[];
  contradict: string[];
}

/** The v1.0.0 baseline's 12 facts; reported apart as `orig` so that baseline stays comparable. */
const ORIG: SeededFact[] = [
  {
    id: 'char-scar',
    class: 'character',
    plant: ['Do', 'show the ferrywoman the long scar on my left cheek and ask if she remembers me'],
    probe: ['Do', 'ask the innkeeper whether my face is known in these parts'],
    statement: 'The player has a long scar on their left cheek.',
    expect: ['scar', 'cheek'],
    contradict: ['unblemished', 'unmarked face', 'no scar', 'smooth cheek'],
  },
  {
    id: 'char-sword',
    class: 'character',
    plant: ['Do', "unwrap my grandfather's bronze sword, Dawnsplitter, and set it on the table"],
    probe: ['Do', 'draw my sword and say its name aloud'],
    statement: "The player carries a bronze sword named Dawnsplitter, their grandfather's.",
    expect: ['dawnsplitter', 'bronze'],
    contradict: ['steel sword', 'iron sword', 'unarmed', 'no weapon'],
  },
  {
    id: 'char-knee',
    class: 'character',
    plant: ['Do', 'favour my right knee as I walk; it was broken last winter and never set straight'],
    probe: ['Do', 'run after the thief down the lane'],
    statement: 'The player has a badly healed right knee and limps.',
    expect: ['right knee', 'limp', 'knee'],
    contradict: ['left knee', 'unhurt', 'sprints', 'at full speed'],
  },
  {
    id: 'char-name',
    class: 'character',
    plant: ['Say', 'My name is Oriel Vance. I am a cartographer out of Hallow Down.'],
    probe: ['Say', 'Who am I, and what is my trade?'],
    statement: 'The player is Oriel Vance, a cartographer from Hallow Down.',
    expect: ['oriel', 'vance', 'cartograph', 'map-maker', 'mapmaker'],
    contradict: ['soldier', 'blacksmith', 'knight', 'farmer'],
  },
  {
    id: 'place-ferry',
    class: 'place',
    plant: ['Do', 'note that the ferry landing sits on the north bank, below the broken mill'],
    probe: ['Do', 'ask for directions back to the ferry landing'],
    statement: 'The ferry landing is on the north bank, below a broken mill.',
    expect: ['north', 'mill'],
    contradict: ['south bank', 'east bank', 'west bank'],
  },
  {
    id: 'place-cellar',
    class: 'place',
    plant: ['Do', "find the trapdoor to the cellar behind the inn's kitchen hearth"],
    probe: ['Do', "go down into the inn's cellar"],
    statement: "The inn's cellar is reached by a trapdoor behind the kitchen hearth.",
    expect: ['cellar', 'trapdoor', 'hearth'],
    contradict: ['attic', 'no cellar', 'has no cellar'],
  },
  {
    id: 'place-tamsin',
    class: 'place',
    plant: ['Do', 'leave Tamsin at her ferry on the river and walk inland alone'],
    probe: ['Say', 'Where is Tamsin now?'],
    statement: 'Tamsin stays at her ferry on the river and has not travelled inland.',
    expect: ['ferry', 'river', 'crossing'],
    contradict: ['beside me', 'with me', 'at the inn', 'followed me'],
  },
  {
    id: 'place-gate',
    class: 'place',
    plant: ['Do', 'walk the earthen wall around the village to its single gate, the only way in'],
    probe: ['Do', 'look for another way into the village'],
    statement: 'The village has an earthen wall and a single gate, the only way in.',
    expect: ['single gate', 'only gate', 'earthen', 'the gate'],
    contradict: ['second gate', 'two gates', 'no wall', 'another gate'],
  },
  {
    id: 'canon-iron',
    class: 'canon',
    plant: ['card', 'In the Marches no one may carry iron across running water. Ferrymen search every pack for it.'],
    card: { name: 'The Iron Law', type: 'Lore', triggers: 'iron,law,ferry,water' },
    probe: ['Do', 'carry my iron knife onto the ferry'],
    statement: 'In the Marches iron may not be carried across running water.',
    expect: ['iron', 'water'],
    contradict: ['no such law', 'iron is welcome', 'nobody minds'],
  },
  {
    id: 'canon-moons',
    class: 'canon',
    plant: ['card', 'Two moons hang over the Marches: Sella rises first, Harrow second. Both are full at midsummer.'],
    card: { name: 'Two Moons', type: 'Lore', triggers: 'moon,moons,sella,harrow,sky' },
    probe: ['Do', 'look up at the night sky'],
    statement: 'The Marches has two moons, Sella and Harrow.',
    expect: ['sella', 'harrow', 'two moons', 'both moons'],
    contradict: ['the moon rises', 'single moon', 'three moons', 'moonless'],
  },
  {
    id: 'canon-dead',
    class: 'canon',
    plant: ['card', 'The dead do not speak in the Marches. Necromancy is unknown here and no ghost has ever been seen.'],
    card: { name: 'The Silent Dead', type: 'Lore', triggers: 'dead,ghost,spirit,grave' },
    probe: ['Do', 'ask the dead of the graveyard for help'],
    statement: 'The dead never speak in the Marches and no ghost has ever been seen.',
    expect: ['no ghost', 'do not speak', 'does not answer', 'silent', 'nothing answers'],
    contradict: ['ghost appears', 'spirit speaks', 'whispers back', 'answers you'],
  },
  {
    id: 'canon-crown',
    class: 'canon',
    plant: ['essentials', 'The year is 1142 of the Marches. The king is dead and no heir has been named.'],
    probe: ['Say', 'Who rules the Marches now?'],
    statement: 'The king of the Marches is dead and no heir has been named.',
    expect: ['no heir', 'king is dead', 'dead king', 'no one rules', 'empty throne'],
    contradict: ['the queen', 'the new king', 'heir has been named', 'the king orders'],
  },
];

export const FACTS: SeededFact[] = [...ORIG, ...MORE_FACTS];
export const isOrig = (f: SeededFact) => ORIG.includes(f);

/** Fixed, and free of every fact's keywords, so no probe is scored on the opening. */
export const OPENING =
  'You come down out of the hills into the Marches at dusk, a letter of passage in your coat and a long way still to go. ' +
  'A woman waits by a boat at the foot of the road, watching you come.';

/** The bench's scenario: plot essentials and story cards from the `essentials` and `card` plants. */
export function scenarioJson(): Scenario {
  const s = newScenario('Recall bench', OPENING);
  return {
    ...s,
    tags: ['fantasy'],
    plot: { ...s.plot, plotEssentials: FACTS.flatMap((f) => (f.plant[0] === 'essentials' ? [f.plant[1]] : [])).join(' ') },
    storyCards: FACTS.flatMap((f) =>
      f.card ? [{ id: `card-${f.id}`, type: f.card.type, name: f.card.name, entry: f.plant[1], triggers: f.card.triggers.split(',') }] : [],
    ),
  };
}

/** Neutral turns between the plants and the probes; cycled to reach the probe depths. */
export const FILLERS: [mode: 'Do' | 'Say', text: string][] = [
  ['Do', 'look around'],
  ['Do', 'follow the path east'],
  ['Do', 'listen for anything moving'],
  ['Say', 'Is anyone there?'],
  ['Do', 'check my pack'],
  ['Do', 'rest a while in the shade'],
  ['Do', 'drink from my waterskin'],
  ['Do', 'watch the clouds gather'],
  ['Do', 'walk on until dusk'],
  ['Say', 'A long road for a short errand.'],
  ['Do', 'make camp and light a small fire'],
  ['Do', 'sleep until first light'],
  ['Do', 'wash my face in the stream'],
  ['Do', 'count the coins I have left'],
  ['Do', 'ask a passing carter for news'],
  ['Say', 'Fair weather for travelling.'],
  ['Do', 'climb the low ridge ahead'],
  ['Do', 'wait for the rain to pass'],
  ['Do', 'sharpen my blade'],
  ['Do', 'press on towards the village'],
];

const hit = (text: string, keys: string[]) => keys.some((k) => text.includes(k.toLowerCase()));

/** A contradiction beats a hit: the model may echo the keyword while getting the fact wrong. */
export function scoreProbe(output: string, fact: SeededFact): Verdict {
  const text = output.toLowerCase();
  if (hit(text, fact.contradict)) return 'contradicted';
  return hit(text, fact.expect) ? 'honoured' : 'absent';
}

/** Was the fact in the prompt at all? Separates a retrieval miss from a model miss. */
export const retrievalHit = (prompt: string, fact: SeededFact) => hit(prompt.toLowerCase(), fact.expect);
