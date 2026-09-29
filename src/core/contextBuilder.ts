import type { Action, Memory, PlotComponents, StoryCard } from './types';
import type { Tokenizer } from './tokenizer';
import { trimHeadToTokens, trimToTokens } from './tokenizer';
import { actionStoryText } from './formatting';
import { compileCards, lookbackWindow, matchCards, type CardMatch } from './storyCards';
import type { RankedMemory } from './memoryBank';

/**
 * Context builder — the engine of the game.
 *
 * Pure function: (adventure state, settings, tokenizer) → prompt sections.
 * Implements the budget rules AI Dungeon documents (docs/SPEC-context-builder.md)
 * and adds an optional cache-stable layout that keeps a byte-stable,
 * append-only prefix so local backends reuse their KV cache every turn.
 *
 * The result is a list of SECTIONS rather than a string: the UI's context
 * viewer, the scripting API (cache-safe mode) and the prompt template all
 * consume sections; `renderBody()` flattens them at the last moment.
 */

export type SectionKind =
  | 'instructions'
  | 'plotEssentials'
  | 'history'
  | 'storyCards'
  | 'storySummary'
  | 'memories'
  | 'authorsNote'
  | 'lastAction'
  | 'frontMemory';

export interface ContextSection {
  kind: SectionKind;
  /** Rendered text including its header line, if any. */
  text: string;
  tokens: number;
  /** True when this section belongs to the byte-stable prefix. */
  cacheable: boolean;
  trimmed?: boolean;
}

export interface ContextBudget {
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
  frontMemory?: string;
  /** Scripting: `state.memory.context` / `.authorsNote` take precedence over the UI values. */
  overrides?: { plotEssentials?: string; authorsNote?: string };
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
  /** Action indices [from, to) included in the history block; null if none. */
  historyRange: { from: number; to: number } | null;
  /** Index of the action used as "last action"; -1 if none. */
  lastActionIndex: number;
  historyFullyIncluded: boolean;
  droppedSections: SectionKind[];
  warnings: string[];
}

const REQUIRED_PRIORITY: { kind: SectionKind; key: keyof PlotComponents }[] = [
  { kind: 'authorsNote', key: 'authorsNote' },
  { kind: 'plotEssentials', key: 'plotEssentials' },
  { kind: 'instructions', key: 'aiInstructions' },
  { kind: 'storySummary', key: 'storySummary' },
];

const HEADERS: Partial<Record<SectionKind, string>> = {
  storyCards: 'World Lore:',
  storySummary: 'Story Summary:',
  memories: 'Memories:',
  history: 'Recent Story:',
};

function renderSection(kind: SectionKind, content: string): string {
  if (kind === 'authorsNote') return `[Author's note: ${content}]`;
  const header = HEADERS[kind];
  return header ? `${header}\n${content}` : content;
}

/** Index of the most recent action that contributes story text (skips `see`). */
export function findLastActionIndex(actions: Action[]): number {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actionStoryText(actions[i]!)) return i;
  }
  return -1;
}

/**
 * Walk backwards from `end` (exclusive) accumulating actions until `budget`
 * tokens are used. Returns the start index of the fitting window.
 */
export function historyWindowStart(
  actions: Action[],
  end: number,
  budget: number,
  tokenizer: Tokenizer,
): { start: number; tokens: number } {
  let used = 0;
  let start = end;
  for (let i = end - 1; i >= 0; i--) {
    const t = actionStoryText(actions[i]!);
    if (!t) {
      start = i;
      continue;
    }
    const cost = tokenizer.count(t) + 1;
    if (used + cost > budget) break;
    used += cost;
    start = i;
  }
  return { start, tokens: used };
}

/** Round a history start up to the next chunk boundary so the prefix only moves every `chunk` actions. */
export function chunkedStart(start: number, end: number, chunk: number): number {
  if (chunk <= 1 || start <= 0) return start;
  const rounded = Math.ceil(start / chunk) * chunk;
  return rounded < end ? rounded : start;
}

export function buildContext(input: ContextBuildInput): ContextBuildResult {
  const { actions, plot, storyCards, rankedMemories, settings, tokenizer } = input;
  const warnings: string[] = [];
  const droppedSections: SectionKind[] = [];
  const total = Math.max(0, Math.floor(settings.contextLength));
  const requiredShare = settings.requiredShare ?? 0.7;
  const requiredCap = Math.floor(total * requiredShare);

  // ---- Required elements -------------------------------------------------
  const lastActionIndex = findLastActionIndex(actions);
  let lastActionText = lastActionIndex >= 0 ? actionStoryText(actions[lastActionIndex]!) : '';
  const frontMemory = (input.frontMemory ?? '').trim();

  let lastTokens = tokenizer.count(lastActionText);
  const frontTokens = tokenizer.count(frontMemory);
  if (lastTokens + frontTokens > requiredCap) {
    // Pathological: a single action larger than 70% of the budget. Keep its tail.
    lastActionText = trimHeadToTokens(lastActionText, Math.max(0, requiredCap - frontTokens), tokenizer);
    lastTokens = tokenizer.count(lastActionText);
    warnings.push('Last action exceeded the required budget and was trimmed from the start.');
  }

  const plotValues: Record<string, string> = {
    authorsNote: (input.overrides?.authorsNote || plot.authorsNote || '').trim(),
    plotEssentials: (input.overrides?.plotEssentials || plot.plotEssentials || '').trim(),
    instructions: (plot.aiInstructions ?? '').trim(),
    storySummary: (plot.storySummary ?? '').trim(),
  };

  let remaining = requiredCap - lastTokens - frontTokens;
  const required = new Map<SectionKind, { text: string; tokens: number; trimmed: boolean }>();
  let stopIncluding = false;
  for (const { kind } of REQUIRED_PRIORITY) {
    const text = plotValues[kind] ?? '';
    if (!text) continue;
    if (stopIncluding) {
      droppedSections.push(kind);
      continue;
    }
    const rendered = renderSection(kind, text);
    const tokens = tokenizer.count(rendered);
    if (tokens <= remaining) {
      required.set(kind, { text: rendered, tokens, trimmed: false });
      remaining -= tokens;
    } else if (remaining > 0) {
      const trimmed = trimToTokens(text, Math.max(0, remaining - 4), tokenizer);
      const rt = renderSection(kind, trimmed);
      required.set(kind, { text: rt, tokens: tokenizer.count(rt), trimmed: true });
      remaining = 0;
      stopIncluding = true;
      warnings.push(`${kind} was trimmed to fit the required budget.`);
    } else {
      droppedSections.push(kind);
      stopIncluding = true;
    }
  }

  let requiredUsed = lastTokens + frontTokens;
  for (const r of required.values()) requiredUsed += r.tokens;
  const dynamicAvailable = Math.max(0, total - requiredUsed);

  // ---- Story cards --------------------------------------------------------
  const cardsBudget = Math.floor(dynamicAvailable * 0.25);
  const window = lookbackWindow(cardsBudget);
  const recentTexts: string[] = [];
  if (lastActionIndex >= 0) {
    for (let i = Math.max(0, lastActionIndex - window + 1); i <= lastActionIndex; i++) {
      recentTexts.push(actionStoryText(actions[i]!));
    }
  }
  const matches = matchCards(compileCards(storyCards), recentTexts);
  const triggeredCards: CardMatch[] = [];
  const droppedCards: CardMatch[] = [];
  const cardHeaderTokens = matches.length ? tokenizer.count(HEADERS.storyCards!) + 1 : 0;
  let cardsUsed = matches.length ? cardHeaderTokens : 0;
  for (const m of matches) {
    const cost = tokenizer.count(m.card.entry) + 2;
    if (cardsUsed + cost <= cardsBudget) {
      triggeredCards.push(m);
      cardsUsed += cost;
    } else {
      droppedCards.push(m);
    }
  }
  if (triggeredCards.length === 0) cardsUsed = 0;
  if (droppedCards.length) warnings.push(`${droppedCards.length} triggered story card(s) did not fit.`);

  // ---- History ------------------------------------------------------------
  const historyShare = settings.memoryBankEnabled ? 0.5 : 0.75;
  const spillFromCards = cardsBudget - cardsUsed;
  let historyBudget = Math.floor(dynamicAvailable * historyShare) + spillFromCards;
  if (!settings.memoryBankEnabled) historyBudget = dynamicAvailable - cardsUsed;
  const headerHistory = tokenizer.count(HEADERS.history!) + 1;
  const end = lastActionIndex; // history excludes the last action
  let historyRange: { from: number; to: number } | null = null;
  let historyUsed = 0;
  let historyFullyIncluded = end <= 0;
  if (end > 0 && historyBudget > headerHistory) {
    const win = historyWindowStart(actions, end, historyBudget - headerHistory, tokenizer);
    let start = win.start;
    historyFullyIncluded = start === 0;
    if (!historyFullyIncluded && settings.cacheStableLayout) {
      start = chunkedStart(start, end, settings.evictionChunk);
    }
    const parts: string[] = [];
    for (let i = start; i < end; i++) {
      const t = actionStoryText(actions[i]!);
      if (t) parts.push(t);
    }
    if (parts.length) {
      historyRange = { from: start, to: end };
      const rendered = renderSection('history', parts.join('\n\n'));
      historyUsed = tokenizer.count(rendered);
      required.set('history', { text: rendered, tokens: historyUsed, trimmed: !historyFullyIncluded });
    }
  } else if (end > 0) {
    warnings.push('No room for story history after required elements and cards.');
  }

  // ---- Memories -----------------------------------------------------------
  const memoriesBudget = settings.memoryBankEnabled ? Math.max(0, dynamicAvailable - cardsUsed - historyUsed) : 0;
  const usedMemories: Memory[] = [];
  let memoriesUsed = 0;
  if (settings.memoryBankEnabled && !historyFullyIncluded && memoriesBudget > 0 && rankedMemories.length) {
    const header = tokenizer.count(HEADERS.memories!) + 1;
    let used = header;
    const historyStart = historyRange?.from ?? end;
    for (const r of rankedMemories) {
      // Skip memories that summarise actions already present verbatim.
      if (r.memory.toAction > historyStart && r.memory.fromAction < end) continue;
      const cost = tokenizer.count(r.memory.text) + 1;
      if (used + cost > memoriesBudget) continue;
      usedMemories.push(r.memory);
      used += cost;
    }
    if (usedMemories.length) {
      const rendered = renderSection('memories', usedMemories.map((m) => m.text).join('\n'));
      memoriesUsed = tokenizer.count(rendered);
      required.set('memories', { text: rendered, tokens: memoriesUsed, trimmed: false });
    }
  }

  // ---- Assemble -----------------------------------------------------------
  const order: SectionKind[] = settings.cacheStableLayout
    ? ['plotEssentials', 'history', 'storyCards', 'storySummary', 'memories', 'authorsNote', 'lastAction', 'frontMemory']
    : ['plotEssentials', 'storyCards', 'storySummary', 'memories', 'history', 'authorsNote', 'lastAction', 'frontMemory'];
  const cacheablePrefix: Set<SectionKind> = settings.cacheStableLayout
    ? new Set(['instructions', 'plotEssentials', 'history'])
    : new Set(['instructions', 'plotEssentials']);

  const sections: ContextSection[] = [];
  const sys = required.get('instructions');
  const system = sys ? plotValues.instructions ?? '' : '';
  if (sys) sections.push({ kind: 'instructions', text: sys.text, tokens: sys.tokens, cacheable: true, trimmed: sys.trimmed });

  if (triggeredCards.length) {
    const rendered = renderSection('storyCards', triggeredCards.map((m) => m.card.entry).join('\n\n'));
    required.set('storyCards', { text: rendered, tokens: tokenizer.count(rendered), trimmed: droppedCards.length > 0 });
  }
  if (lastActionText) required.set('lastAction', { text: lastActionText, tokens: lastTokens, trimmed: false });
  if (frontMemory) required.set('frontMemory', { text: frontMemory, tokens: frontTokens, trimmed: false });

  const bodyParts: string[] = [];
  for (const kind of order) {
    const r = required.get(kind);
    if (!r) continue;
    sections.push({ kind, text: r.text, tokens: r.tokens, cacheable: cacheablePrefix.has(kind), trimmed: r.trimmed });
    bodyParts.push(r.text);
  }
  const body = bodyParts.join('\n\n');

  const used = sections.reduce((n, s) => n + s.tokens, 0);
  const budget: ContextBudget = {
    total,
    requiredCap,
    requiredUsed,
    dynamicAvailable,
    cardsBudget,
    cardsUsed,
    historyBudget,
    historyUsed,
    memoriesBudget,
    memoriesUsed,
    used,
    free: Math.max(0, total - used),
  };

  return {
    system,
    body,
    sections,
    budget,
    triggeredCards,
    droppedCards,
    usedMemories,
    historyRange,
    lastActionIndex,
    historyFullyIncluded,
    droppedSections,
    warnings,
  };
}

/** Flatten sections (excluding the system section) into the user-turn text. */
export function renderBody(sections: ContextSection[]): string {
  return sections
    .filter((s) => s.kind !== 'instructions')
    .map((s) => s.text)
    .join('\n\n');
}
