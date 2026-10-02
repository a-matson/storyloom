import type { Adventure } from '../model/types';
import { actionText } from '../model/types';
import { createMemory, dueMemoryRanges, evictToSize, summaryDue } from './memoryBank';
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
  summaryUpdated: boolean;
}

/** Memories re-embedded per idle run after an embedder change. [provisional] */
const REEMBED_BATCH = 32;

/** Bring vectors from a previous embedder (other length, or none) in line with the current one. */
async function reembed(adventure: Adventure, deps: MaintenanceDeps): Promise<void> {
  const dims = deps.embedder.dimensions;
  if (!dims || deps.signal?.aborted) return; // unknown until the embedder's first result
  const batch = adventure.memories.filter((m) => !m.stale && m.embedding?.length !== dims).slice(0, REEMBED_BATCH);
  if (!batch.length) return;
  const vectors = await deps.embedder.embed(batch.map((m) => m.text));
  const byId = new Map(batch.map((m, i) => [m.id, vectors[i]]));
  adventure.memories = adventure.memories.map((m) => {
    const embedding = byId.get(m.id);
    return embedding ? { ...m, embedding } : m;
  });
}

export async function runMemoryMaintenance(adventure: Adventure, deps: MaintenanceDeps): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { memoriesWritten: 0, memoriesForgotten: 0, summaryUpdated: false };
  const settings = adventure.settings.memory;
  const actions = adventure.actions;
  const count = actions.length;

  if (settings.memoryBank || settings.autoSummary) {
    // Memories feed both features (auto-summary uses them to bridge gaps).
    const due = dueMemoryRanges(count, adventure.memories);
    for (const range of due) {
      if (deps.signal?.aborted) break;
      const passage = joinStory(actions.slice(range.fromAction, range.toAction));
      if (!passage.trim()) continue;
      const prompt = renderTemplate(deps.template, MEMORY_SYSTEM, memoryPrompt(passage));
      const { text } = await collect(
        deps.provider.complete(
          { prompt: prompt.prompt, maxTokens: 120, temperature: 0.3, topP: 0.9, stop: prompt.stop, cachePrompt: false, slotId: 1 },
          deps.signal,
        ),
      );
      const memoryText = text.trim();
      if (!memoryText) continue;
      const [embedding] = await deps.embedder.embed([memoryText]);
      adventure.memories = [...adventure.memories, createMemory(memoryText, actions, range, embedding)];
      report.memoriesWritten += 1;
    }
    await reembed(adventure, deps);
    const { kept, forgotten } = evictToSize(adventure.memories, settings.bankSize);
    adventure.memories = kept;
    report.memoriesForgotten = forgotten.length;
  }

  if (settings.autoSummary) {
    const lastAt = adventure.scriptState.__summaryAt ?? 0;
    if (summaryDue(count, lastAt)) {
      const since = adventure.memories.filter((m) => m.fromAction >= lastAt).map((m) => m.text);
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
