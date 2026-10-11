import type { Adventure } from '../model/types';
import { actionText } from '../model/types';
import { SUMMARY_SYSTEM, summaryPrompt } from '../text/prompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { trimUnfinishedSentence } from '../text/formatting';
import { helperCall, sentencesOnly } from './helperCall';
import { MEMORY_SPAN, summaryDue } from './memoryBank';
import type { MaintenanceDeps } from './memoryJobs';

/** Actions the summary reads verbatim as its "most recent passage". */
const RECENT_ACTIONS = MEMORY_SPAN;

/** Refresh `plot.storySummary` when due or dirty; true when it changed. */
export async function refreshSummary(adventure: Adventure, deps: Omit<MaintenanceDeps, 'embedder'>): Promise<boolean> {
  const count = adventure.actions.length;
  const dirty = adventure.scriptState.__summaryDirty === true;
  // A dirty summary told of text that is gone: rebuilt from every memory, without its old self.
  const lastAt = dirty ? 0 : (adventure.scriptState.__summaryAt ?? 0);
  if (!(dirty || summaryDue(count, lastAt)) || deps.signal?.aborted) return false;
  // Everything after the previous refresh's recent passage, so no action falls between two summaries.
  const since = adventure.memories.filter((m) => !m.stale && m.toAction > lastAt - RECENT_ACTIONS).map((m) => m.text);
  const recent = adventure.actions
    .slice(Math.max(0, count - RECENT_ACTIONS))
    .map(actionText)
    .join('\n\n');
  const prompt = renderTemplate(
    deps.template,
    withContent(SUMMARY_SYSTEM, deps.content),
    summaryPrompt(dirty ? '' : (adventure.plot.storySummary ?? ''), since, recent),
  );
  const grammar = await sentencesOnly(deps.provider, 8);
  const { text: raw, stats } = await helperCall(
    'summary',
    400,
    (signal) =>
      deps.provider.complete(
        { prompt: prompt.prompt, maxTokens: 400, temperature: 0.3, topP: 0.9, stop: prompt.stop, cachePrompt: false, slotId: 1, grammar },
        signal,
      ),
    deps,
  );
  const text = trimUnfinishedSentence(raw, stats?.stopReason).trim();
  if (!text) return false;
  adventure.plot = { ...adventure.plot, storySummary: text };
  adventure.scriptState = { ...adventure.scriptState, __summaryAt: count, __summaryDirty: false };
  return true;
}
