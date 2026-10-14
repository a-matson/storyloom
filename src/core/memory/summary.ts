import type { Adventure } from '../model/types';
import { SUMMARY_SYSTEM, summaryPrompt } from '../text/prompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { trimUnfinishedSentence } from '../text/formatting';
import { helperCall, sentencesOnly } from './helperCall';
import { summaryDue, summaryOverdue } from './memoryBank';
import type { MaintenanceDeps } from './memoryJobs';
import { youLines } from './you';

/** Long ago (≤ 6) plus Recently (≤ 6). [provisional] */
const SUMMARY_SENTENCES = 12;

/**
 * Where the summary may reach: text evicted from the history (`[0, historyStart)`) that a memory already
 * covers. Text still in history is never summarised; evicted text with no memory yet waits for one.
 */
export function coveredEnd(adventure: Pick<Adventure, 'memories'>, historyStart: number | undefined): number {
  const remembered = adventure.memories.reduce((n, m) => (m.stale ? n : Math.max(n, m.toAction)), 0);
  return Math.min(historyStart ?? 0, remembered);
}

/** True when the summary is two chunks behind the evicted text, so it runs before the memory jobs. */
export const summaryFirst = (adventure: Adventure, historyStart: number | undefined): boolean =>
  summaryOverdue(coveredEnd(adventure, historyStart), adventure.scriptState.__summaryAt ?? 0, adventure.settings.context.evictionChunk);

/** Extend `plot.storySummary` with the memories of newly evicted text, or rebuild it when dirty; true when it changed. */
export async function refreshSummary(adventure: Adventure, deps: Omit<MaintenanceDeps, 'embedder'>): Promise<boolean> {
  const dirty = adventure.scriptState.__summaryDirty === true;
  // A dirty summary told of text that is gone: rebuilt from every memory, without its old self.
  const lastAt = dirty ? 0 : (adventure.scriptState.__summaryAt ?? 0);
  const end = coveredEnd(adventure, deps.historyStart);
  if (!(dirty || summaryDue(end, lastAt, adventure.settings.context.evictionChunk)) || deps.signal?.aborted) return false;
  const since = adventure.memories.filter((m) => !m.stale && m.toAction > lastAt && m.toAction <= end).map((m) => m.text);
  const previous = dirty ? '' : (adventure.plot.storySummary ?? '');
  if (!since.length && !previous) return false;
  const prompt = renderTemplate(deps.template, withContent(SUMMARY_SYSTEM, deps.content), summaryPrompt(previous, since, youLines(adventure.assertions)));
  const grammar = await sentencesOnly(deps.provider, SUMMARY_SENTENCES);
  const { text: raw, stats } = await helperCall(
    'summary',
    500,
    prompt.prompt,
    (signal) =>
      deps.provider.complete(
        { prompt: prompt.prompt, maxTokens: 500, temperature: 0.3, topP: 0.9, stop: prompt.stop, cachePrompt: false, slotId: 1, grammar },
        signal,
      ),
    deps,
  );
  const text = trimUnfinishedSentence(raw, stats?.stopReason).trim();
  if (!text) return false;
  adventure.plot = { ...adventure.plot, storySummary: text };
  adventure.scriptState = { ...adventure.scriptState, __summaryAt: end, __summaryDirty: false };
  return true;
}
