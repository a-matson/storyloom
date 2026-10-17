import { buildContext as build, type ContextBuildInput } from '@core/context';
import type { Action, EntityFact, LegacyEntity } from '@core/model/types';
import type { Tokenizer } from '@core/text/tokenizer';
import { derived } from './assertions';

/** The mill: Lena present, Orrin named by the last action, Tamsin absent. */
export const buildContext = (i: ContextBuildInput) => build(derived(i));

/** 1 token per 4 characters, as in contextBuilder.test.ts. */
const tok: Tokenizer = { count: (t) => (t ? Math.ceil(t.length / 4) : 0) };
let id = 0;
export const act = (type: Action['type'], text: string): Action => ({ id: `a${++id}`, type, versions: [text], active: 0, createdAt: id });
const long = (words: number) => Array.from({ length: words }, (_, i) => `w${i}`).join(' ');
export const fact = (name: string, i: number, text: string, over: Partial<EntityFact> = {}): EntityFact => ({
  id: `f-${name}-${i}`,
  text,
  fromAction: i,
  source: 'memory',
  ...over,
});

export function entity(name: string, description: string, facts: EntityFact[], state: Record<string, string> = {}): LegacyEntity & { facts: EntityFact[] } {
  return { id: `e-${name}`, kind: 'character', name, aliases: [], description, facts, state, relations: [], firstSeen: 0, lastSeen: 1 };
}

export const actions = [
  act('start', 'The mill.'),
  ...Array.from({ length: 30 }, (_, i) => act('continue', `${i} ${long(20)}`)),
  act('do', '> You call for Orrin.'),
];
export const scene = { location: 'the mill', present: ['Lena'], weather: 'cold rain at night' };
export const lena = entity(
  'Lena',
  'Lena keeps the mill. She has for years.',
  [
    fact('Lena', 0, 'She has blue eyes.'),
    fact('Lena', 1, 'eyes: blue', { kind: 'state', key: 'eyes', value: 'blue' }),
    fact('Lena', 2, 'mood: wary', { kind: 'state', key: 'mood', value: 'wary' }),
    fact('Lena', 3, 'poisoned', { kind: 'effect', value: 'poisoned', cause: { kind: 'item', text: 'the green wine' } }),
    fact('Lena', 4, 'distrusts you', { kind: 'relationship' }),
    fact('Lena', 5, 'She hums.', { source: 'player' }),
  ],
  { location: 'the loft' },
);
export const orrin = entity('Orrin', 'Orrin is a ferryman.', [
  fact('Orrin', 0, 'He fears water.'),
  fact('Orrin', 1, 'mood: calm', { kind: 'state', key: 'mood', value: 'calm' }),
]);
export const tamsin = entity('Tamsin', 'Tamsin is far away.', [fact('Tamsin', 0, 'She left.')]);
export const settings = (contextLength: number, cacheStableLayout = false) => ({ contextLength, memoryBankEnabled: true, cacheStableLayout, evictionChunk: 8 });
export const input = (contextLength: number, cacheStableLayout = false): ContextBuildInput => ({
  actions,
  plot: { authorsNote: 'AN', scene },
  storyCards: [],
  entities: [lena, orrin, tamsin],
  rankedMemories: [],
  settings: settings(contextLength, cacheStableLayout),
  tokenizer: tok,
});
const kinds = new Set(['rules', 'scene', 'cast']);
export const structured = (r: ReturnType<typeof buildContext>) => r.sections.filter((s) => kinds.has(s.kind));
export const cast = (r: ReturnType<typeof buildContext>) => r.sections.find((s) => s.kind === 'cast')?.text;
