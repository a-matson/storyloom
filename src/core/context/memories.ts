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
 * overflowed, and never for ranges mostly still present verbatim in [historyStart, end).
 * `mark`: the `(known only to …) ` prefix of a memory that tells a secret.
 */
export function selectMemories(
  ranked: RankedMemory[],
  budget: number,
  historyStart: number,
  end: number,
  tokenizer: Tokenizer,
  out: RenderedSections,
  mark: (m: Memory) => string = () => '',
): MemoriesResult {
  const usedMemories: Memory[] = [];
  const texts: string[] = [];
  let used = tokenizer.count(HEADERS.memories) + 1;
  for (const { memory } of ranked) {
    // A memory straddling the history's start counts once at least half its range has left; that half is then sent twice.
    const evicted = Math.min(historyStart, memory.toAction) - memory.fromAction;
    if (memory.toAction > historyStart && memory.fromAction < end && 2 * evicted < memory.toAction - memory.fromAction) continue;
    const text = mark(memory) + memory.text;
    const cost = tokenizer.count(text) + 1;
    if (used + cost > budget) continue;
    usedMemories.push(memory);
    texts.push(text);
    used += cost;
  }
  if (!usedMemories.length) return { memoriesBudget: budget, memoriesUsed: 0, usedMemories };
  const rendered = renderSection('memories', texts.join('\n'));
  const memoriesUsed = tokenizer.count(rendered);
  out.set('memories', { text: rendered, tokens: memoriesUsed, trimmed: false });
  return { memoriesBudget: budget, memoriesUsed, usedMemories };
}
