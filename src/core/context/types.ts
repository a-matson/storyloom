import type { CardMatch } from '../cards/storyCards';
import type { RankedMemory } from '../memory/memoryBank';
import type { Action, Assertion, Entity, Memory, PlotComponents, Rule, StoryCard } from '../model/types';
import type { Tokenizer } from '../text/tokenizer';

/** One cut: what was taken out of which section, for which secret. */
export interface Redaction {
  secretId: string;
  section: SectionKind;
  text: string;
}

export type SectionKind =
  | 'instructions'
  | 'plotEssentials'
  | 'history'
  | 'storyCards'
  | 'storySummary'
  | 'memories'
  | 'authorsNote'
  /** One retry's "keep to this" line; never stored. */
  | 'retryNote'
  /** `[Rules: …]`: confirmed rules whose gates are in play. */
  | 'rules'
  | 'scene'
  /** Now-lines for who is in the scene, identities for who is named, the player's pins. */
  | 'cast'
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
  /** Shared cap for rules, scene and cast; what they leave goes to the dynamic budget. */
  structuredBudget: number;
  structuredUsed: number;
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
  /** Cap on rules + scene + cast, as a share of `contextLength`, never over `STRUCTURED_CAP`. Default 0.1. [provisional] */
  structuredShare?: number;
  /** The cast sends only pinned and conflicting facts; rules and the scene line are unaffected. */
  pinnedFactsOnly?: boolean;
  /** The content clause, appended to the AI Instructions in the system prompt. */
  content?: string;
  /** `Replies run about N words in P paragraphs.`, joined to the Author's note. Empty/absent sends nothing. */
  lengthLine?: string;
}

export interface ContextBuildInput {
  actions: Action[];
  plot: PlotComponents;
  storyCards: StoryCard[];
  /** Sent as cast lines under the structured cap, never through `storyCards`. */
  entities: Entity[];
  /** What the cast lines and item lists say about the entities. */
  assertions?: readonly Assertion[];
  /** Characters whose confirmed goal is sent this turn however recently they acted (the Now card's Nudge). */
  nudged?: readonly string[];
  /** Sent as `[Rules: …]` while relevant (`relevantRules`), first claim on the structured cap. */
  rules?: readonly Rule[];
  /** Memories ranked by relevance to the most recent action, best first. */
  rankedMemories: RankedMemory[];
  /** Scripting: `state.memory.frontMemory`, appended after the last action. */
  frontMemory?: string | undefined;
  /** Scripting: `state.memory.context` / `.authorsNote` take precedence over the UI values. */
  overrides?: { plotEssentials?: string | undefined; authorsNote?: string | undefined };
  /** Retry with a note: the fact the retried output broke, for this one generation. */
  retryNote?: string | undefined;
  /** Words too common to admit an asked-about fact alone (`COMMON_WORDS`); none without. */
  everyday?: ReadonlySet<string>;
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
  usedFacts: { entityId: string; factId: string }[];
  /** Entities with a cast line in the prompt. */
  usedEntityIds: string[];
  /** Rules in the `[Rules: …]` line. */
  usedRuleIds: string[];
  /** Action indices [from, to) included in the history block; null if none. */
  historyRange: { from: number; to: number } | null;
  /** Index of the action used as "last action"; -1 if none. */
  lastActionIndex: number;
  historyFullyIncluded: boolean;
  droppedSections: SectionKind[];
  /** What was cut for secrets an outsider in the cast does not know; empty with no outsider. */
  redactions: Redaction[];
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
