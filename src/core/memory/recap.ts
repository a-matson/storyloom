import type { Action, Adventure } from '../model/types';
import { indexAssertions, type AssertionOf } from './assertionIndex';
import { heldBy } from './items';
import { sceneNames } from './names';
import { YOU } from './you';

/** How long since the last action before reopening shows "Previously on". [provisional] */
export const RECAP_GAP_MS = 12 * 3_600_000;
/** The summary tail's length. [provisional] */
const SUMMARY_CHARS = 200;
const EVENTS = 2;

export interface Recap {
  summary?: string;
  events: string[];
  present: string[];
  held: string[];
}

export const recapDue = (actions: readonly Action[], now: number): boolean => {
  const last = actions.at(-1);
  return last !== undefined && now - last.createdAt >= RECAP_GAP_MS;
};

/** The last sentences of the summary's Recently (or the whole, unlabelled) that fit the tail. */
function tail(summary: string): string | undefined {
  const recent = summary.split(/\bRecently:/).at(-1) ?? '';
  const sentences =
    recent
      .match(/[^.!?]+[.!?]*/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  const kept: string[] = [];
  for (const s of sentences.toReversed()) {
    if (kept.length > 0 && [s, ...kept].join(' ').length > SUMMARY_CHARS) break;
    kept.unshift(s);
  }
  return kept.length ? kept.join(' ') : undefined;
}

/** What happened, who is here and what you hold: read from stored state, no helper call. */
export function recap(adv: Adventure): Recap {
  const summary = tail(adv.plot.storySummary ?? '');
  const events = adv.assertions
    .filter((a): a is AssertionOf<'event'> => a.kind === 'event' && a.seen !== false)
    .toSorted((a, b) => a.at - b.at)
    .slice(-EVENTS)
    .map((a) => a.text);
  return {
    ...(summary && { summary }),
    events,
    present: adv.plot.scene ? sceneNames(adv.plot.scene, adv.entities).present : [],
    held: heldBy(adv.entities, indexAssertions(adv.assertions), YOU).map((e) => e.name),
  };
}
