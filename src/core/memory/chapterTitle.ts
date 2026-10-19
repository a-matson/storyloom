import type { Adventure } from '../model/types';
import { withContent } from '../text/content';
import { CHAPTER_SYSTEM, chapterTitlePrompt } from '../text/memoryPrompts';
import { renderTemplate } from '../text/templates';
import { chapterStarts, withChapter } from './chapters';
import { eventsSince } from './events';
import { helperCall } from './helperCall';
import type { MaintenanceDeps } from './memoryJobs';

const TOKENS = 16;
/** Lines of a chapter the helper is given, the latest. [provisional] */
const LINES_GIVEN = 8;
const MAX_WORDS = 8;

/** The reply's first line, unquoted, at most `MAX_WORDS` words; undefined when empty. */
export function checkTitle(reply: string): string | undefined {
  const line =
    reply
      .trim()
      .split('\n')[0]
      ?.replace(/^["“'*\s]+|["”'*.\s]+$/g, '') ?? '';
  return line ? line.split(/\s+/).slice(0, MAX_WORDS).join(' ') : undefined;
}

/**
 * One slot-1 call per closed chapter without a title, from its events (else its memories); the title is stored as a
 * proposal (`seen: false`). A chapter with nothing to read stays "Chapter N". Returns how many were titled.
 */
export async function titleChapters(adventure: Adventure, deps: Omit<MaintenanceDeps, 'embedder'>): Promise<number> {
  let titled = 0;
  const starts = chapterStarts(adventure.plot);
  for (const [i, c] of starts.entries()) {
    const end = starts[i + 1]?.at;
    if (deps.signal?.aborted || end === undefined || end > adventure.actions.length) break;
    if (c.title) continue;
    const events = eventsSince(adventure.assertions, c.at, end).map((e) => e.text);
    const lines = events.length ? events : adventure.memories.filter((m) => !m.stale && m.fromAction >= c.at && m.toAction <= end).map((m) => m.text);
    if (!lines.length) continue;
    const prompt = renderTemplate(deps.template, withContent(CHAPTER_SYSTEM, deps.content), chapterTitlePrompt(lines.slice(-LINES_GIVEN)));
    const stop = [...new Set([...prompt.stop, '\n'])];
    const req = { prompt: prompt.prompt, maxTokens: TOKENS, temperature: 0.3, topP: 0.9, stop, cachePrompt: false, slotId: 1 };
    const { text } = await helperCall('summary', TOKENS, prompt.prompt, (signal) => deps.provider.complete(req, signal), deps);
    const title = checkTitle(text);
    if (!title) continue;
    adventure.plot = { ...adventure.plot, chapters: withChapter(adventure.plot.chapters, { at: c.at, title, seen: false }) };
    titled++;
  }
  return titled;
}
