import { actionText, type Action, type ActionType, type GateReason } from '../model/types';
import { ngramJaccard } from '../text/repetition';

/** Earlier AI outputs a reply is gated against. [provisional] */
export const GATE_WINDOW = 10;
/** 4-gram Jaccard with one earlier output at which a reply counts as a copy; stock phrases sit well below. [provisional] */
export const VERBATIM_JACCARD = 0.4;

/** A `> ` line is the model writing the player's next input. [provisional] */
const PLAYER_LINE = /(^|\n)\s*> /;
/** "You say ... \"" puts words in the player's mouth; not when the "You" opens a character's quote. [provisional] */
const PLAYER_WORDS = /(?<!["“])\byou (say|ask|reply|decide|tell)\b[^.!?\n]{0,40}["“]/i;

/** The retry note per reason, sent in the second prompt only. */
export const GATE_NOTES: Record<GateReason, string> = {
  empty: 'Continue the story.',
  verbatim: 'Do not repeat an earlier passage.',
  agency: "Never write the player's actions or words.",
};

/** The last `window` AI outputs, oldest first, leaving out `actionId` (the reply itself). */
export function previousOutputs(actions: readonly Action[], actionId: string | undefined, window: number): string[] {
  return actions
    .filter((a) => (a.type === 'continue' || a.type === 'start') && a.id !== actionId)
    .slice(-window)
    .map(actionText);
}

/** The first reason `text` should be re-rolled, if any. Agency is only checked after a do/say in second person. */
export function gateOutput(
  text: string,
  previous: readonly string[],
  { playerType, thirdPerson }: { playerType: ActionType | undefined; thirdPerson: boolean },
): GateReason | undefined {
  if (text.trim() === '') return 'empty';
  if (previous.slice(-GATE_WINDOW).some((p) => ngramJaccard(text, p, 4) >= VERBATIM_JACCARD)) return 'verbatim';
  const acted = playerType === 'do' || playerType === 'say';
  if (acted && !thirdPerson && (PLAYER_LINE.test(text) || PLAYER_WORDS.test(text))) return 'agency';
  return undefined;
}
