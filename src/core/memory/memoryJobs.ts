import type { Action, Adventure, Memory, Speaker } from '../model/types';
import { createMemory, currentRange, dueMemoryRanges, evictToSize, isPlayerAction, type MemoryRange } from './memoryBank';
import { MEMORY_SYSTEM, memoryPrompt } from '../text/memoryPrompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import type { Provider } from '../ports/provider';
import type { Embedder } from '../ports/embedder';
import { joinStory, trimUnfinishedSentence } from '../text/formatting';
import { catchUpEntities } from './extract';
import type { Rejected } from './fold';
import { dropUnsupported } from './invalidate';
import { helperCall, sentencesOnly, type CutCounts } from './helperCall';
import { refreshSummary, summaryFirst } from './summary';
import { ngramOverlap } from '../text/repetition';
import { youLines } from './you';

// For the player's entity edits, which load with these jobs.
export { entityNamedIn, guessUnlabelled, mergeEntities } from './entities';
export { mergeOwn } from './assertionWrites';
export { updateEntities } from './extract';
export { introduce } from './introduce';
export { readState } from './stateRead';
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
  /** The content clause appended to every system prompt here (`contentClause(settings, 'record')`). */
  content?: string | undefined;
  /** Stops before the next model call; a call already streaming finishes so its tokens are not wasted. */
  signal?: AbortSignal;
  /** Cuts a streaming call too (the player started typing) until it is half done; a cut reply is dropped. Pass it inside `signal` as well. */
  cancel?: AbortSignal;
  cuts?: CutCounts;
  /** First action of the history in the last built context; undefined before the first turn (nothing evicted). */
  historyStart?: number | undefined;
  /** A provider and template per job, when they differ from `provider`/`template` (a read routed to the utility model). */
  modelFor?: (job: MaintenanceJob) => Pick<MaintenanceDeps, 'provider' | 'template'>;
}

export type MaintenanceJob = 'memory' | 'batch' | 'summary';

export interface MaintenanceReport extends CutCounts {
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
  summaryUpdated: boolean;
  /** The summary was overdue and ran before the memories. */
  summaryFirst: boolean;
  /** Trait facts the entity call proposed, and every value its guards dropped: a live run sums them. */
  factsProposed: number;
  rejected: Rejected[];
}

/** A memory's text needs no embedder. */
type TextDeps = Omit<MaintenanceDeps, 'embedder'>;

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

/** Above this share of quoted dialogue the "memory" is a scene, not a summary. [provisional] */
const MAX_QUOTED = 0.3;
/** Above this share of word 6-grams copied from the passage the "memory" is the passage itself. [provisional] */
const MAX_COPIED = 0.3;

/** False when the model continued or copied the story instead of summarising it. */
export function isMemoryLike(text: string, passage: string): boolean {
  if (text.includes('> You') || /^["“]/.test(text)) return false;
  const quoted = (text.match(/"[^"]*"|“[^”]*”/g) ?? []).join('').length;
  return quoted <= text.length * MAX_QUOTED && ngramOverlap(text, passage, 6) <= MAX_COPIED;
}

async function summarise(passage: string, deps: TextDeps, given: readonly string[]): Promise<string> {
  const prompt = renderTemplate(deps.template, withContent(MEMORY_SYSTEM, deps.content), memoryPrompt(passage, given));
  // A memory is 1-4 sentences, so a player-stated trait fits beside the events; the extra stops end a reply that drifts into the next turn.
  const stop = [...new Set([...prompt.stop, '\n>', '<|im_start|>'])];
  const grammar = await sentencesOnly(deps.provider, 4);
  const { text, stats } = await helperCall(
    'memory',
    120,
    prompt.prompt,
    (signal) =>
      deps.provider.complete({ prompt: prompt.prompt, maxTokens: 120, temperature: 0.3, topP: 0.9, stop, cachePrompt: false, slotId: 1, grammar }, signal),
    deps,
  );
  return trimUnfinishedSentence(text, stats?.stopReason).trim();
}

/**
 * A memory's text for one slice; '' when the passage or the model's answer is empty, or the answer
 * is still a story continuation after one retry on the passage cut back to its last AI output.
 */
export async function memoryText(
  slice: Action[],
  deps: TextDeps,
  report: Pick<MaintenanceReport, 'memoriesRejected'>,
  given: readonly string[] = [],
): Promise<string> {
  const passage = joinStory(slice);
  if (!passage.trim()) return '';
  const text = await summarise(passage, deps, given);
  if (!text || isMemoryLike(text, passage)) return text;
  if (deps.signal?.aborted) return '';
  const lastAi = slice.findLastIndex((a) => !isPlayerAction(a));
  const cut = joinStory(slice.slice(0, lastAi + 1)) || passage;
  const retry = await summarise(cut, deps, given);
  if (!retry || isMemoryLike(retry, cut)) return retry;
  console.warn('memory rejected twice:', retry);
  report.memoriesRejected += 1;
  return '';
}

/** Summarise and embed one range; null when there is no memory text for it. */
async function writeMemory(adventure: Adventure, range: MemoryRange, deps: MaintenanceDeps, report: MaintenanceReport): Promise<Memory | null> {
  const text = await memoryText(adventure.actions.slice(range.fromAction, range.toAction), deps, report, youLines(adventure.assertions));
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
    summaryUpdated: false,
    summaryFirst: false,
    factsProposed: 0,
    rejected: [],
    calls: [],
    cutCalls: 0,
    finishedPastCut: 0,
  };
  try {
    await maintain(adventure, { ...deps, cuts: report }, report);
  } catch (e) {
    // Typing cut a call: the run ends there, and what it finished stays.
    if (!deps.cancel?.aborted) throw e;
  }
  return report;
}

async function maintain(adventure: Adventure, all: MaintenanceDeps, report: MaintenanceReport): Promise<void> {
  const on = (job: MaintenanceJob): MaintenanceDeps => ({ ...all, ...all.modelFor?.(job) });
  const deps = on('memory');
  const settings = adventure.settings.memory;
  const actions = adventure.actions;
  // Memories feed both features (auto-summary uses them to bridge gaps).
  const memoriesOn = settings.memoryBank || settings.autoSummary;
  dropUnsupported(adventure, actions);
  // Memory jobs filled every idle slot and the summary never ran (none in 44 actions).
  report.summaryFirst = settings.autoSummary && summaryFirst(adventure, deps.historyStart);
  // An edited range must not feed the summary its old text.
  const regenerateFirst = report.summaryFirst && memoriesOn && adventure.memories.some((m) => m.stale);
  if (regenerateFirst) await regenerateStale(adventure, deps, report);
  if (report.summaryFirst) report.summaryUpdated = await refreshSummary(adventure, on('summary'));

  if (memoriesOn) {
    if (!regenerateFirst) await regenerateStale(adventure, deps, report);
    for (const range of dueMemoryRanges(actions, adventure.memories)) {
      if (deps.signal?.aborted) break;
      const memory = await writeMemory(adventure, range, deps, report);
      if (!memory) continue;
      adventure.memories = [...adventure.memories, memory];
      report.memoriesWritten += 1;
    }
    // The one combined helper call per two memories; a bad reply only costs the entities.
    const e = await catchUpEntities(adventure, on('batch'));
    ({ touched: report.entitiesTouched, speakers: report.speakers } = e);
    report.factsProposed = e.log?.proposed ?? 0;
    report.rejected = e.log?.rejected ?? [];
    await reembed(adventure, deps);
    const evicted = evictToSize(adventure.memories, settings.bankSize);
    adventure.memories = evicted.memories;
    report.memoriesForgotten = evicted.forgotten;
  }

  if (settings.autoSummary && !report.summaryFirst) report.summaryUpdated = await refreshSummary(adventure, on('summary'));
}
