import type { Assertion, PlotComponents } from '../model/types';
import { isCurrent, textOf } from './assertionIndex';

/** The `holder` value and assertion subject that mean the player. */
export const YOU = 'you';

/** The player's own current lines about themselves: not a conflict, not a secret (that is a scoped fact, not a trait). */
export const isYouLine = (a: Assertion): boolean =>
  a.subject === YOU && a.producer === 'player' && isCurrent(a) && a.kind !== 'conflict' && a.kind !== 'secret';

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
