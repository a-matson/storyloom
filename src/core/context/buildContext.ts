import { selectCards } from './cards';
import { selectHistory } from './history';
import { selectMemories, type MemoriesResult } from './memories';
import { renderBody } from './render';
import { selectRequired } from './required';
import type { ContextBuildInput, ContextBuildResult, ContextSection, RenderedSections, SectionKind } from './types';

/**
 * Context builder — the engine of the game.
 *
 * Pure function: (adventure state, settings, tokenizer) → prompt sections.
 * Implements the budget rules AI Dungeon documents and adds an optional
 * cache-stable layout that keeps a byte-stable, append-only prefix so local
 * backends reuse their KV cache every turn.
 *
 * Stages, in budget order: required (70% cap) → cards (25% of the rest) →
 * history → memories (whatever is left) → assemble in layout order.
 */
export function buildContext(input: ContextBuildInput): ContextBuildResult {
  const { actions, settings, tokenizer } = input;
  const warnings: string[] = [];
  const droppedSections: SectionKind[] = [];
  const out: RenderedSections = new Map();
  const total = Math.max(0, Math.floor(settings.contextLength));
  const requiredCap = Math.floor(total * (settings.requiredShare ?? 0.7));

  const req = selectRequired(input, requiredCap, out, warnings, droppedSections);
  const dynamicAvailable = Math.max(0, total - req.requiredUsed);
  const cards = selectCards(actions, req.lastActionIndex, input.storyCards, dynamicAvailable, tokenizer, out, warnings);
  const end = req.lastActionIndex; // history excludes the last action
  const history = selectHistory(actions, end, dynamicAvailable, cards, settings, tokenizer, out, warnings);

  const memoriesBudget = settings.memoryBankEnabled ? Math.max(0, dynamicAvailable - cards.cardsUsed - history.historyUsed) : 0;
  const useMemories = settings.memoryBankEnabled && !history.historyFullyIncluded && memoriesBudget > 0 && input.rankedMemories.length > 0;
  const memories: MemoriesResult = useMemories
    ? selectMemories(input.rankedMemories, memoriesBudget, history.historyRange?.from ?? end, end, tokenizer, out)
    : { memoriesBudget, memoriesUsed: 0, usedMemories: [] };

  if (req.lastActionText) out.set('lastAction', { text: req.lastActionText, tokens: req.lastTokens, trimmed: false });
  if (req.frontMemory) out.set('frontMemory', { text: req.frontMemory, tokens: req.frontTokens, trimmed: false });
  const sections = assemble(out, settings.cacheStableLayout);
  const used = sections.reduce((n, s) => n + s.tokens, 0);

  return {
    system: req.instructions,
    body: renderBody(sections),
    sections,
    budget: {
      total,
      requiredCap,
      requiredUsed: req.requiredUsed,
      dynamicAvailable,
      cardsBudget: cards.cardsBudget,
      cardsUsed: cards.cardsUsed,
      historyBudget: history.historyBudget,
      historyUsed: history.historyUsed,
      memoriesBudget: memories.memoriesBudget,
      memoriesUsed: memories.memoriesUsed,
      used,
      free: Math.max(0, total - used),
    },
    triggeredCards: cards.triggeredCards,
    droppedCards: cards.droppedCards,
    usedMemories: memories.usedMemories,
    historyRange: history.historyRange,
    lastActionIndex: req.lastActionIndex,
    historyFullyIncluded: history.historyFullyIncluded,
    droppedSections,
    warnings,
  };
}

// Cache-stable layout moves history up into the prefix and lore after it, so only the tail changes per turn.
const STABLE_ORDER: SectionKind[] = ['plotEssentials', 'history', 'storyCards', 'storySummary', 'memories', 'authorsNote', 'lastAction', 'frontMemory'];
const AID_ORDER: SectionKind[] = ['plotEssentials', 'storyCards', 'storySummary', 'memories', 'history', 'authorsNote', 'lastAction', 'frontMemory'];
const STABLE_PREFIX = new Set<SectionKind>(['instructions', 'plotEssentials', 'history']);
const AID_PREFIX = new Set<SectionKind>(['instructions', 'plotEssentials']);

/** System section first, then the body in layout order; marks which sections form the cacheable prefix. */
function assemble(out: RenderedSections, cacheStable: boolean): ContextSection[] {
  const prefix = cacheStable ? STABLE_PREFIX : AID_PREFIX;
  const order: SectionKind[] = ['instructions', ...(cacheStable ? STABLE_ORDER : AID_ORDER)];
  return order.flatMap((kind) => {
    const r = out.get(kind);
    return r ? [{ kind, text: r.text, tokens: r.tokens, cacheable: prefix.has(kind), trimmed: r.trimmed }] : [];
  });
}
