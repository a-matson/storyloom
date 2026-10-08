import type { Action, Adventure, Memory, Speaker } from '../model/types';
import { actionText } from '../model/types';
import { createMemory, currentRange, dueMemoryRanges, evictToSize, isPlayerAction, MEMORY_SPAN, summaryDue, type MemoryRange } from './memoryBank';
import { MEMORY_EXAMPLE_DETAILS, MEMORY_SYSTEM, SUMMARY_SYSTEM, memoryPrompt, sentenceGrammar, summaryPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { collect, type Provider } from '../ports/provider';
import type { Embedder } from '../ports/embedder';
import { joinStory, trimUnfinishedSentence } from '../text/formatting';
import { trackJob } from '../trace';
import { catchUpEntities } from './extract';

// For the player's entity edits, which load with these jobs.
export { entityNamedIn, guessUnlabelled, mergeEntities } from './entities';
export { updateEntities } from './extract';
export { checkInputs, checkOutput } from './contradiction';
export { MEMORY_SPAN } from './memoryBank';
export { projectEntity } from './projection';

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
  /** Stops before the next model call; a call already streaming finishes so its tokens are not wasted. */
  signal?: AbortSignal;
  /** Cuts a streaming call too (the player started typing); its partial reply is dropped. Pass it inside `signal` as well. */
  cancel?: AbortSignal;
}

export interface MaintenanceReport {
  memoriesWritten: number;
  memoriesForgotten: number;
  memoriesRegenerated: number;
  /** Stale memories whose actions were erased. */
  memoriesDropped: number;
  /** Ranges skipped because the model continued the story twice. */
  memoriesRejected: number;
  /** Entities created or changed by the extraction that follows each written memory. */
  entitiesTouched: number;
  /** The helper's speaker labels by action id; the caller applies them through the log. */
  speakers: Map<string, Speaker[]>;
  /** `plot.scene` moved, from the same helper call. */
  sceneUpdated: boolean;
  summaryUpdated: boolean;
}

/** A memory's text needs no embedder. */
type TextDeps = Omit<MaintenanceDeps, 'embedder'>;

/** Stale memories rewritten per idle run, so a big edit does not hold slot 1. [provisional] */
const REGENERATE_BATCH = 2;

/** Actions the summary reads verbatim as its "most recent passage". */
const RECENT_ACTIONS = MEMORY_SPAN;

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

/** Above this share of quoted dialogue the "memory" is a scene, not a summary. [provisional] */
const MAX_QUOTED = 0.3;

/** False when the model continued the story instead of summarising it. */
export function isMemoryLike(text: string): boolean {
  if (text.includes('> You') || /^["“]/.test(text)) return false;
  const quoted = (text.match(/"[^"]*"|“[^”]*”/g) ?? []).join('').length;
  return quoted <= text.length * MAX_QUOTED;
}

/** Grammar for at most `max` sentences when the backend supports one; the trim and validator cover the rest. */
async function sentencesOnly(deps: TextDeps, max: number): Promise<string | undefined> {
  return (await deps.provider.capabilities()).grammar ? sentenceGrammar(max) : undefined;
}

async function summarise(passage: string, deps: TextDeps): Promise<string> {
  const prompt = renderTemplate(deps.template, MEMORY_SYSTEM, memoryPrompt(passage));
  // A memory is 1-4 sentences, so a player-stated trait fits beside the events; the extra stops end a reply that drifts into the next turn.
  const stop = [...new Set([...prompt.stop, '\n>', '<|im_start|>'])];
  const grammar = await sentencesOnly(deps, 4);
  const { text, stats } = await trackJob('memory', () =>
    collect(
      deps.provider.complete({ prompt: prompt.prompt, maxTokens: 120, temperature: 0.3, topP: 0.9, stop, cachePrompt: false, slotId: 1, grammar }, deps.cancel),
    ),
  );
  if (deps.cancel?.aborted) return '';
  return dropExampleDetails(trimUnfinishedSentence(text, stats?.stopReason).trim(), passage);
}

/** Drops each sentence naming a detail of the worked example that the passage does not; the prompt's "never copy" line alone did not stop it. */
function dropExampleDetails(memory: string, passage: string): string {
  const lower = passage.toLowerCase();
  const leaked = MEMORY_EXAMPLE_DETAILS.filter((d) => !lower.includes(d));
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(memory)].map((s) => s.segment);
  return sentences
    .filter((s) => !leaked.some((d) => s.toLowerCase().includes(d)))
    .join('')
    .trim();
}

/**
 * A memory's text for one slice; '' when the passage or the model's answer is empty, or the answer
 * is still a story continuation after one retry on the passage cut back to its last AI output.
 */
export async function memoryText(slice: Action[], deps: TextDeps, report: Pick<MaintenanceReport, 'memoriesRejected'>): Promise<string> {
  const passage = joinStory(slice);
  if (!passage.trim()) return '';
  const text = await summarise(passage, deps);
  if (!text || isMemoryLike(text)) return text;
  if (deps.signal?.aborted) return '';
  const lastAi = slice.findLastIndex((a) => !isPlayerAction(a));
  const retry = await summarise(joinStory(slice.slice(0, lastAi + 1)) || passage, deps);
  if (!retry || isMemoryLike(retry)) return retry;
  console.warn('memory rejected twice:', retry);
  report.memoriesRejected += 1;
  return '';
}

/** Summarise and embed one range; null when there is no memory text for it. */
async function writeMemory(adventure: Adventure, range: MemoryRange, deps: MaintenanceDeps, report: MaintenanceReport): Promise<Memory | null> {
  const text = await memoryText(adventure.actions.slice(range.fromAction, range.toAction), deps, report);
  if (!text) return null;
  const [embedding] = await deps.embedder.embed([text]);
  return createMemory(text, adventure.actions, range, embedding);
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
    const fresh = await writeMemory(adventure, range, deps, report);
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
  const report: MaintenanceReport = {
    memoriesWritten: 0,
    memoriesForgotten: 0,
    memoriesRegenerated: 0,
    memoriesDropped: 0,
    memoriesRejected: 0,
    entitiesTouched: 0,
    speakers: new Map(),
    sceneUpdated: false,
    summaryUpdated: false,
  };
  const settings = adventure.settings.memory;
  const actions = adventure.actions;
  const count = actions.length;

  if (settings.memoryBank || settings.autoSummary) {
    // Memories feed both features (auto-summary uses them to bridge gaps).
    await regenerateStale(adventure, deps, report);
    for (const range of dueMemoryRanges(actions, adventure.memories)) {
      if (deps.signal?.aborted) break;
      const memory = await writeMemory(adventure, range, deps, report);
      if (!memory) continue;
      adventure.memories = [...adventure.memories, memory];
      report.memoriesWritten += 1;
    }
    // The one combined helper call per two memories; a bad reply only costs the entities.
    ({ touched: report.entitiesTouched, speakers: report.speakers, sceneUpdated: report.sceneUpdated } = await catchUpEntities(adventure, deps));
    await reembed(adventure, deps);
    const evicted = evictToSize(adventure.memories, settings.bankSize);
    adventure.memories = evicted.memories;
    report.memoriesForgotten = evicted.forgotten;
  }

  if (settings.autoSummary) {
    const lastAt = adventure.scriptState.__summaryAt ?? 0;
    if (summaryDue(count, lastAt) && !deps.signal?.aborted) {
      // Everything after the previous refresh's recent passage, so no action falls between two summaries.
      const since = adventure.memories.filter((m) => !m.stale && m.toAction > lastAt - RECENT_ACTIONS).map((m) => m.text);
      const recent = actions
        .slice(Math.max(0, count - RECENT_ACTIONS))
        .map(actionText)
        .join('\n\n');
      const prompt = renderTemplate(deps.template, SUMMARY_SYSTEM, summaryPrompt(adventure.plot.storySummary ?? '', since, recent));
      const grammar = await sentencesOnly(deps, 8);
      const { text: raw, stats } = await trackJob('summary', () =>
        collect(
          deps.provider.complete(
            {
              prompt: prompt.prompt,
              maxTokens: 400,
              temperature: 0.3,
              topP: 0.9,
              stop: prompt.stop,
              cachePrompt: false,
              slotId: 1,
              grammar,
            },
            deps.cancel,
          ),
        ),
      );
      const text = trimUnfinishedSentence(raw, stats?.stopReason).trim();
      if (text && !deps.cancel?.aborted) {
        adventure.plot = { ...adventure.plot, storySummary: text };
        adventure.scriptState = { ...adventure.scriptState, __summaryAt: count };
        report.summaryUpdated = true;
      }
    }
  }
  return report;
}
