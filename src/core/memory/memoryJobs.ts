import type { Adventure, Memory } from '../model/types';
import { actionText } from '../model/types';
import { createMemory, currentRange, dueMemoryRanges, evictToSize, summaryDue, type MemoryRange } from './memoryBank';
import { MEMORY_SYSTEM, SUMMARY_SYSTEM, memoryPrompt, summaryPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { collect, type Provider } from '../ports/provider';
import type { Embedder } from '../ports/embedder';
import { joinStory } from '../text/formatting';

/**
 * Background memory maintenance. Call after each committed turn; it is safe
 * to call often (it does nothing when nothing is due) and never blocks the
 * player's next turn — the UI runs it in an idle slot.
 *
 * Uses the utility provider when given one (a small instruct model on a
 * second server), otherwise the story provider.
 */
export interface MaintenanceDeps {
  provider: Provider;
  embedder: Embedder;
  /** Template of the model on `provider`. */
  template: Adventure['settings']['template'];
  signal?: AbortSignal;
}

export interface MaintenanceReport {
  memoriesWritten: number;
  memoriesForgotten: number;
  memoriesRegenerated: number;
  /** Stale memories whose actions were erased. */
  memoriesDropped: number;
  summaryUpdated: boolean;
}

/** Stale memories rewritten per idle run, so a big edit does not hold slot 1. [provisional] */
const REGENERATE_BATCH = 2;

/** Memories re-embedded per idle run after an embedder change. [provisional] */
const REEMBED_BATCH = 32;

/** Bring vectors from a previous embedder (other length, or none) in line with the current one. */
async function reembed(adventure: Adventure, deps: MaintenanceDeps): Promise<void> {
  const dims = deps.embedder.dimensions;
  if (!dims || deps.signal?.aborted) return; // unknown until the embedder's first result
  const batch = adventure.memories.filter((m) => !m.stale && !m.forgotten && m.embedding?.length !== dims).slice(0, REEMBED_BATCH);
  if (!batch.length) return;
  const vectors = await deps.embedder.embed(batch.map((m) => m.text));
  const byId = new Map(batch.map((m, i) => [m.id, vectors[i]]));
  adventure.memories = adventure.memories.map((m) => {
    const embedding = byId.get(m.id);
    return embedding ? { ...m, embedding } : m;
  });
}

/** Summarise and embed one range; null when the passage or the model's answer is empty. */
async function writeMemory(adventure: Adventure, range: MemoryRange, deps: MaintenanceDeps): Promise<Memory | null> {
  const passage = joinStory(adventure.actions.slice(range.fromAction, range.toAction));
  if (!passage.trim()) return null;
  const prompt = renderTemplate(deps.template, MEMORY_SYSTEM, memoryPrompt(passage));
  const { text } = await collect(
    deps.provider.complete(
      { prompt: prompt.prompt, maxTokens: 120, temperature: 0.3, topP: 0.9, stop: prompt.stop, cachePrompt: false, slotId: 1 },
      deps.signal,
    ),
  );
  const memoryText = text.trim();
  if (!memoryText) return null;
  const [embedding] = await deps.embedder.embed([memoryText]);
  return createMemory(memoryText, adventure.actions, range, embedding);
}

/** Drop stale memories whose actions were erased (forgotten ones too); rewrite a few of the rest in place. */
async function regenerateStale(adventure: Adventure, deps: MaintenanceDeps, report: MaintenanceReport): Promise<void> {
  const stale = adventure.memories.filter((m) => m.stale);
  const ranges = new Map(stale.map((m) => [m.id, currentRange(adventure.actions, m)]));
  const drop = new Set(stale.filter((m) => !ranges.get(m.id) || m.forgotten).map((m) => m.id));
  if (drop.size) adventure.memories = adventure.memories.filter((m) => !drop.has(m.id));
  report.memoriesDropped = drop.size;
  for (const old of stale.filter((m) => !drop.has(m.id)).slice(0, REGENERATE_BATCH)) {
    const range = ranges.get(old.id);
    if (deps.signal?.aborted || !range) break;
    const fresh = await writeMemory(adventure, range, deps);
    if (!fresh) continue;
    // Same id, use count and age: it is the same memory with corrected text.
    const { id, useCount, createdAt, lastUsedAt } = old;
    adventure.memories = adventure.memories.map((m) =>
      m.id === id ? { ...fresh, id, useCount, createdAt, ...(lastUsedAt !== undefined && { lastUsedAt }) } : m,
    );
    report.memoriesRegenerated += 1;
  }
}

export async function runMemoryMaintenance(adventure: Adventure, deps: MaintenanceDeps): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { memoriesWritten: 0, memoriesForgotten: 0, memoriesRegenerated: 0, memoriesDropped: 0, summaryUpdated: false };
  const settings = adventure.settings.memory;
  const actions = adventure.actions;
  const count = actions.length;

  if (settings.memoryBank || settings.autoSummary) {
    // Memories feed both features (auto-summary uses them to bridge gaps).
    await regenerateStale(adventure, deps, report);
    for (const range of dueMemoryRanges(count, adventure.memories)) {
      if (deps.signal?.aborted) break;
      const memory = await writeMemory(adventure, range, deps);
      if (!memory) continue;
      adventure.memories = [...adventure.memories, memory];
      report.memoriesWritten += 1;
    }
    await reembed(adventure, deps);
    const evicted = evictToSize(adventure.memories, settings.bankSize);
    adventure.memories = evicted.memories;
    report.memoriesForgotten = evicted.forgotten;
  }

  if (settings.autoSummary) {
    const lastAt = adventure.scriptState.__summaryAt ?? 0;
    if (summaryDue(count, lastAt)) {
      const since = adventure.memories.filter((m) => !m.stale && m.fromAction >= lastAt).map((m) => m.text);
      const recent = actions
        .slice(Math.max(0, count - 6))
        .map(actionText)
        .join('\n\n');
      const prompt = renderTemplate(deps.template, SUMMARY_SYSTEM, summaryPrompt(adventure.plot.storySummary ?? '', since, recent));
      const { text } = await collect(
        deps.provider.complete(
          { prompt: prompt.prompt, maxTokens: 400, temperature: 0.3, topP: 0.9, stop: prompt.stop, cachePrompt: false, slotId: 1 },
          deps.signal,
        ),
      );
      if (text.trim()) {
        adventure.plot = { ...adventure.plot, storySummary: text.trim() };
        adventure.scriptState = { ...adventure.scriptState, __summaryAt: count };
        report.summaryUpdated = true;
      }
    }
  }
  return report;
}
