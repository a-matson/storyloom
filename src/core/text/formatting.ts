import type { Action, ActionType, PlotComponents } from '../model/types';
import { actionText } from '../model/types';

/**
 * Turn a player's raw input into the line that goes into the story text.
 *
 * Mirrors AI Dungeon's conventions so scripts and community advice apply:
 *   Do    → "> You draw the lantern closer."   (third person: "> Merav draws…" is
 *            the player's job; we only swap the pronoun prefix)
 *   Say   → "> You say \"How far to the next well?\""
 *   Story → the text itself, no prefix
 *   See   → never enters the story text (image only)
 */
export function formatPlayerInput(type: ActionType, raw: string, plot?: PlotComponents): string {
  const text = raw.trim();
  const subject = plot?.thirdPerson?.enabled && plot.thirdPerson.name ? plot.thirdPerson.name : 'You';
  switch (type) {
    case 'do': {
      if (!text) return `> ${subject} wait.`;
      // If the player already wrote a subject ("You go north", "I go north"), keep it.
      const startsWithSubject = /^(you|i|we|they|he|she|[A-Z][a-z]+)\b/.test(text);
      const body = startsWithSubject ? text : `${subject} ${text}`;
      return `> ${ensureTerminal(body)}`;
    }
    case 'say': {
      const quoted = /^["“].*["”]$/.test(text) ? text : `"${text}"`;
      return `> ${subject} say${subject === 'You' ? '' : 's'} ${quoted}`;
    }
    case 'story':
    case 'start':
    case 'continue':
      return text;
    case 'see':
      return '';
    default:
      return text;
  }
}

function ensureTerminal(s: string): string {
  return /[.!?…"”]$/.test(s) ? s : `${s}.`;
}

/** Text of an action as it appears in the "Recent Story" block. */
export function actionStoryText(a: Action): string {
  if (a.type === 'see') return '';
  return actionText(a);
}

/**
 * Join actions into story text. Player Do/Say lines already carry their
 * "> " prefix (added at input time), so this is a plain join with blank
 * lines, skipping empties.
 */
export function joinStory(actions: Action[]): string {
  const parts: string[] = [];
  for (const a of actions) {
    const t = actionStoryText(a);
    if (t) parts.push(t);
  }
  return parts.join('\n\n');
}

/**
 * Post-process a raw model output the way AI Dungeon does by default: drop a
 * trailing unfinished sentence so the story never ends mid-word. Players can
 * turn this off with the Raw Model Output setting.
 */
export function trimUnfinishedSentence(output: string): string {
  const s = output.replace(/\s+$/, '');
  if (!s) return s;
  if (/[.!?…"”'’)\]]$/.test(s)) return s;
  const idx = Math.max(
    s.lastIndexOf('. '),
    s.lastIndexOf('! '),
    s.lastIndexOf('? '),
    s.lastIndexOf('.\n'),
    s.lastIndexOf('!\n'),
    s.lastIndexOf('?\n'),
    s.lastIndexOf('”'),
    s.lastIndexOf('"'),
  );
  if (idx <= 0) return s; // nothing to cut back to; keep as is
  return s.slice(0, idx + 1).trimEnd();
}
