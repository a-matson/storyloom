import type { Adventure } from '../model/types';
import { SUMMARY_SYSTEM, eraPrompt, summaryPrompt } from '../text/memoryPrompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { trimUnfinishedSentence } from '../text/formatting';
import { eventsSince } from './events';
import { helperCall, sentencesOnly } from './helperCall';
import { summaryDue, summaryOverdue } from './memoryBank';
import type { MaintenanceDeps } from './memoryJobs';
import { youLines } from './you';
import { markOf } from './secrets';

/** "Recently": the newest memories and events. 12 in all with Long ago's opening and era. [provisional] */
const RECENT_SENTENCES = 6;
/** "Long ago": the story's opening, kept as written, then the era before Recently, retold. [provisional] */
const OPENING_SENTENCES = 3;
const ERA_SENTENCES = 3;
/**
 * Memories Recently is written from; older ones in the same refresh are retold into Long ago. Play adds 1–3 per refresh;
 * a catch-up over 88 squeezed the opening out of a 6-sentence Recently. [measured: 2026-10-17-recall-300-m19-5-d270]
 */
const RECENT_MEMORIES = 6;

/** A summary's Long ago and Recently; text without the labels (the player's own) is all Long ago. */
function partsOf(summary: string): [string, string] {
  const [head = '', ...tail] = summary.split(/\bRecently:/);
  return [head.replace(/^\s*Long ago:/, '').trim(), tail.join('Recently:').trim()];
}

const firstSentences = (text: string, n: number): string =>
  (text.match(/[^.!?]+[.!?]+/g) ?? [])
    .slice(0, n)
    .map((s) => s.trim())
    .join(' ');

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

/** At most `max` sentences from one summary call; '' when nothing came back. */
async function write(user: string, max: number, deps: Omit<MaintenanceDeps, 'embedder'>): Promise<string> {
  const prompt = renderTemplate(deps.template, withContent(SUMMARY_SYSTEM, deps.content), user);
  const grammar = await sentencesOnly(deps.provider, max);
  const { text, stats } = await helperCall(
    'summary',
    300,
    prompt.prompt,
    (signal) =>
      deps.provider.complete(
        { prompt: prompt.prompt, maxTokens: 300, temperature: 0.3, topP: 0.9, stop: prompt.stop, cachePrompt: true, slotId: 1, grammar },
        signal,
      ),
    deps,
  );
  return trimUnfinishedSentence(text, stats?.stopReason).trim();
}

/**
 * Write a new Recently from the memories and events of newly evicted text. Long ago is code's: the old Long ago's
 * first sentences (the opening), then the old Recently retold short. The model never sees text it could copy: shown
 * the old summary, it returned it unchanged on every refresh, the old Long ago in each compression it was asked for.
 * The era before the last is dropped; the memories keep it. Dirty (it told of text that is gone): rebuilt from every
 * memory, without its old self. True when it changed. [measured: 2026-10-17-summary-m19-5-before, -b, -b3]
 */
export async function refreshSummary(adventure: Adventure, deps: Omit<MaintenanceDeps, 'embedder'>): Promise<boolean> {
  const dirty = adventure.scriptState.__summaryDirty === true;
  const lastAt = dirty ? 0 : (adventure.scriptState.__summaryAt ?? 0);
  const end = coveredEnd(adventure, deps.historyStart);
  if (!(dirty || summaryDue(end, lastAt, adventure.settings.context.evictionChunk)) || deps.signal?.aborted) return false;
  const since = adventure.memories
    .filter((m) => !m.stale && !m.skipped && m.toAction > lastAt && m.toAction <= end)
    .map((m) => markOf(adventure.assertions, adventure.entities, m) + m.text);
  const events = eventsSince(adventure.assertions, lastAt, end).map((e) => e.text);
  if (!since.length && !events.length) return false;
  const recently = await write(summaryPrompt(since.slice(-RECENT_MEMORIES), events, youLines(adventure.assertions)), RECENT_SENTENCES, deps);
  if (!recently) return false;
  const [longAgo, previous] = dirty ? ['', ''] : partsOf(adventure.plot.storySummary ?? '');
  const older = [previous, ...since.slice(0, -RECENT_MEMORIES)].filter(Boolean).join(' ');
  const era = older && ((await write(eraPrompt(older), ERA_SENTENCES, deps)) || firstSentences(older, ERA_SENTENCES));
  const past = [firstSentences(longAgo, OPENING_SENTENCES), era].filter(Boolean).join(' ');
  adventure.plot = { ...adventure.plot, storySummary: (past ? `Long ago: ${past}\n\n` : '') + `Recently: ${recently}` };
  adventure.scriptState = { ...adventure.scriptState, __summaryAt: end, __summaryDirty: false };
  return true;
}
