import { indexAssertions, nextQuestions, type SheetKey } from '@core/memory';
import type { GameSession } from './session';

/** A builder session for one character: answers are assertions already, so only the round and skips live here. */
export interface Draft {
  round: number;
  asked: SheetKey[];
  skipped: SheetKey[];
}

// Session memory, not persisted: a skip saved as "marks: none" would reach the image prompt.
const drafts = new Map<string, Draft>();

/** The character's draft, a first round if there is none. */
export function draftOf(host: GameSession, id: string): Draft {
  return drafts.get(id) ?? { round: 1, asked: nextQuestions(indexAssertions(host.adv.assertions).of(id), []), skipped: [] };
}

export const saveDraft = (id: string, d: Draft) => drafts.set(id, d);

/** The round after `d`, asked from the answers so far. */
export const nextRound = (host: GameSession, id: string, d: Draft): Draft => ({
  ...d,
  round: d.round + 1,
  asked: nextQuestions(indexAssertions(host.adv.assertions).of(id), d.skipped),
});
