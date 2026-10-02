import { createBlankAdventure } from '@core/scenario';
import type { Action, Adventure, Memory, StoryCard } from '@core/types';

/** mulberry32: tiny seeded PRNG so fixtures are identical on every run and machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  'the lantern caravan salt wind map needle well warden flats ash merav you walk stop listen dune night star camel tent river stone gate oath blind whisper'.split(
    ' ',
  );
const NAMES = ['Merav', 'Ashen Flats', 'Needle Map', 'Well-wardens', 'Corrow', 'Old Gate', 'Salt Road', 'Star Tent'];

export interface FixtureOptions {
  actions: number;
  cards?: number;
  memories?: number;
  embeddingDim?: number;
  seed?: number;
}

/**
 * A realistic adventure: alternating player/AI actions (AI turns ~60–120 words),
 * cards whose triggers appear in the text, and memories with embeddings.
 */
export function makeAdventure({ actions, cards = 40, memories = 0, embeddingDim = 384, seed = 1 }: FixtureOptions): Adventure {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const sentence = (min: number, max: number) => Array.from({ length: min + Math.floor(r() * (max - min)) }, () => pick(WORDS)).join(' ');

  const adv = createBlankAdventure('Fixture', sentence(40, 60));
  const list: Action[] = [];
  for (let i = 0; i < actions; i++) {
    const isPlayer = i % 2 === 1;
    const text = isPlayer ? `You ${sentence(4, 10)}.` : `${sentence(60, 120)} ${pick(NAMES)}.`;
    list.push({ id: `a${i}`, type: isPlayer ? 'do' : 'continue', versions: [text], active: 0, createdAt: i });
  }
  const storyCards: StoryCard[] = Array.from({ length: cards }, (_, i) => {
    const name = `${pick(NAMES)} ${i}`;
    return { id: `c${i}`, type: 'Location', name, entry: sentence(30, 80), triggers: [name.toLowerCase(), pick(WORDS)] };
  });
  const mems: Memory[] = Array.from({ length: memories }, (_, i) => ({
    id: `m${i}`,
    text: sentence(20, 40),
    fromAction: i * 6,
    toAction: i * 6 + 6,
    actionIds: [],
    embedding: Array.from({ length: embeddingDim }, () => r() * 2 - 1),
    useCount: 0,
    createdAt: i,
  }));
  return { ...adv, actions: [...adv.actions, ...list], storyCards, memories: mems };
}
