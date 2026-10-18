import type { Adventure, Assertion, PlotComponents } from '../model/types';
import { actionText } from '../model/types';
import { isCurrent, textOf } from './assertionIndex';

/** The `holder` value and assertion subject that mean the player. */
export const YOU = 'you';

/** The player and how the story addresses them, and a role the grammar let through by capitalising its article ("The creature"). */
export const NOT_A_NAME = /^\s*(?:you|master|mistress|sir|madam|my lord|my lady)\s*$|^(the|a|an) \p{Ll}/iu;

/** "You are Rowan, a ferry pilot…": up to two capitalised words, then a comma or a full stop. */
const OPENING = /^\s*You are (\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)?)[,.]/u;

/**
 * The player's name: the stored third-person name whether or not third person is on, else the
 * opening's "You are X" (player or scenario text, so the player's word). Never an entity.
 */
export function playerName({ plot, actions }: Pick<Adventure, 'plot' | 'actions'>): string | undefined {
  const stored = plot.thirdPerson?.name.trim();
  if (stored) return stored;
  const start = actions.find((a) => a.type === 'start');
  const name = start && OPENING.exec(actionText(start))?.[1];
  return name && !NOT_A_NAME.test(name) ? name : undefined;
}

/** The player's own current lines about themselves: not a conflict, not a secret nor an event (neither is a trait). */
export const isYouLine = (a: Assertion): boolean =>
  a.subject === YOU && a.producer === 'player' && isCurrent(a) && a.kind !== 'conflict' && a.kind !== 'secret' && a.kind !== 'event';

/** What the player wrote about themselves, one line each; the story's reads are left out so a helper cannot echo its own guesses. */
export const youLines = (as: readonly Assertion[]): string[] => as.filter(isYouLine).map(textOf);

/** The player's pronouns and own lines for the instructions; '' when there are neither. */
export function playerLine(plot: Pick<PlotComponents, 'you' | 'thirdPerson'>, as: readonly Assertion[]): string {
  const p = plot.you?.pronouns?.trim();
  const lines = youLines(as).map((l) => l.trim().replace(/[.;]+$/, ''));
  const name = plot.thirdPerson?.enabled === true ? plot.thirdPerson.name.trim() : '';
  const who = `The player (${name || '"you"'})`;
  return [p ? `${who} uses ${p} pronouns.` : '', lines.length ? `${p ? 'About the player' : who}: ${lines.join('; ')}.` : ''].filter(Boolean).join(' ');
}
