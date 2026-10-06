import type { CardMatch } from '../cards/storyCards';
import type { RankedMemory } from '../memory/memoryBank';
import type { Action, Memory, PlotComponents, StoryCard } from '../model/types';
import type { Tokenizer } from '../text/tokenizer';

export type SectionKind =
  | 'instructions'
  | 'plotEssentials'
  | 'history'
  | 'storyCards'
  | 'storySummary'
  | 'memories'
  | 'authorsNote'
  | 'scene'
  | 'lastAction'
  | 'frontMemory'
  /** Inserted by a script through `sections`; never part of the cacheable prefix. */
  | 'script';

export interface ContextSection {
  kind: SectionKind;
  /** Rendered text including its header line, if any. */
  text: string;
  tokens: number;
  /** True when this section belongs to the byte-stable prefix. */
  cacheable: boolean;
  trimmed?: boolean;
}

interface ContextBudget {
  total: number;
  requiredCap: number;
  requiredUsed: number;
  dynamicAvailable: number;
  cardsBudget: number;
  cardsUsed: number;
  historyBudget: number;
  historyUsed: number;
  memoriesBudget: number;
  memoriesUsed: number;
  used: number;
  free: number;
}

export interface ContextBuildSettings {
  /** Input token budget. */
  contextLength: number;
  memoryBankEnabled: boolean;
  cacheStableLayout: boolean;
  /** History is trimmed in blocks of this many actions in cache-stable mode. */
  evictionChunk: number;
  /** Share of the budget reserved for Required elements. AID: 0.7. */
  requiredShare?: number;
}

export interface ContextBuildInput {
  actions: Action[];
  plot: PlotComponents;
  storyCards: StoryCard[];
  /** Memories ranked by relevance to the most recent action, best first. */
  rankedMemories: RankedMemory[];
  /** Scripting: `state.memory.frontMemory`, appended after the last action. */
  frontMemory?: string | undefined;
  /** Scripting: `state.memory.context` / `.authorsNote` take precedence over the UI values. */
  overrides?: { plotEssentials?: string | undefined; authorsNote?: string | undefined };
  settings: ContextBuildSettings;
  tokenizer: Tokenizer;
}

export interface ContextBuildResult {
  /** AI Instructions — sent as the system prompt. */
  system: string;
  /** Everything else, rendered in order. */
  body: string;
  /** Sections in render order (system first). */
  sections: ContextSection[];
  budget: ContextBudget;
  triggeredCards: CardMatch[];
  droppedCards: CardMatch[];
  usedMemories: Memory[];
  /** The ranking the memories were picked from, so the viewer can show scores as sent. */
  rankedMemories: RankedMemory[];
  /** Action indices [from, to) included in the history block; null if none. */
  historyRange: { from: number; to: number } | null;
  /** Index of the action used as "last action"; -1 if none. */
  lastActionIndex: number;
  historyFullyIncluded: boolean;
  droppedSections: SectionKind[];
  warnings: string[];
}

/** A section's rendered text before it gets its place in the layout. */
export interface Rendered {
  text: string;
  tokens: number;
  trimmed: boolean;
}

/** Stages collect into one map; `assemble` orders it. */
export type RenderedSections = Map<SectionKind, Rendered>;
