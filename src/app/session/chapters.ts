import { withChapter } from '@core/memory';
import type { GameSession } from './session';

/** `/chapter [title]`: the next action starts a chapter. Never an action, like `/time`. */
export function markChapter(host: GameSession, text: string): void {
  const title = text.trim();
  host.mutate((log, adv) => {
    adv.plot = { ...adv.plot, chapters: withChapter(adv.plot.chapters, { at: log.actions.length, ...(title && { title }) }) };
  });
  host.emit({ notice: title ? `Next chapter: ${title}` : 'The next action starts a chapter' });
}
