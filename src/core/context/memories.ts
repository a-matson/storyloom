import type { RankedMemory } from '../memory/memoryBank';
import type { Memory } from '../model/types';
import type { Tokenizer } from '../text/tokenizer';
import { HEADERS, renderSection } from './render';
import type { RenderedSections } from './types';

export interface MemoriesResult {
  memoriesBudget: number;
  memoriesUsed: number;
  usedMemories: Memory[];
}

/**
 * Best-ranked memories in whatever budget cards and history left. Only used when history
 * overflowed, and never for ranges still present verbatim in [historyStart, end).
 */
export function selectMemories(
  ranked: RankedMemory[],
  budget: number,
  historyStart: number,
  end: number,
  tokenizer: Tokenizer,
  out: RenderedSections,
): MemoriesResult {
  const usedMemories: Memory[] = [];
  let used = tokenizer.count(HEADERS.memories) + 1;
  for (const { memory } of ranked) {
    if (memory.toAction > historyStart && memory.fromAction < end) continue;
    const cost = tokenizer.count(memory.text) + 1;
    if (used + cost > budget) continue;
    usedMemories.push(memory);
    used += cost;
  }
  if (!usedMemories.length) return { memoriesBudget: budget, memoriesUsed: 0, usedMemories };
  const rendered = renderSection('memories', usedMemories.map((m) => m.text).join('\n'));
  const memoriesUsed = tokenizer.count(rendered);
  out.set('memories', { text: rendered, tokens: memoriesUsed, trimmed: false });
  return { memoriesBudget: budget, memoriesUsed, usedMemories };
}
