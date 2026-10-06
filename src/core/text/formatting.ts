import type { Action, ActionType, PlotComponents } from '../model/types';
import { actionText } from '../model/types';
import type { CompletionStats } from '../ports/provider';

/** The split `Action.speakers` indexes: blank lines. */
export const paragraphs = (text: string): string[] => text.split(/\n\s*\n/);

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
 * turn this off with the Raw Model Output setting. An output the model ended
 * itself (`stop`/`eos`) is complete; only an unmatched trailing quote goes,
 * since it would sit in history and the next prompt. [AID-doc]
 */
export function trimUnfinishedSentence(output: string, stopReason?: CompletionStats['stopReason']): string {
  const s = output.trimEnd();
  const ended = stopReason === 'stop' || stopReason === 'eos';
  const kept = ended ? s : s.slice(0, lastSentenceEnd(s) || s.length).trimEnd();
  const openQuote = kept.endsWith('“') || (kept.endsWith('"') && (kept.match(/"/g)?.length ?? 0) % 2 === 1);
  return openQuote ? kept.slice(0, -1).trimEnd() : kept;
}

/**
 * Where a stream may stop: just past a sentence that ends after `from` and is
 * already followed by whitespace (so the "3." of "3.5" does not count), else 0.
 */
export function sentenceEndAfter(s: string, from: number): number {
  const end = lastSentenceEnd(s);
  return end > from && /\s/.test(s.charAt(end)) ? end : 0;
}

/**
 * Index just past the last complete sentence, 0 if none. Terminal punctuation
 * inside open dialogue does not count (cutting there leaves an unmatched
 * quote); a quote closed after terminal punctuation or a dash does.
 */
function lastSentenceEnd(s: string): number {
  let open = false;
  let end = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    const afterTerminal = /[.!?…]/.test(s.charAt(i - 1));
    if (c === '“' || (c === '"' && !open)) open = true;
    else if (c === '”' || c === '"') {
      open = false;
      if (afterTerminal || s.charAt(i - 1) === '—') end = i + 1;
    } else if (/[)\]’]/.test(c) && afterTerminal) end = i + 1;
    else if (!open && /[.!?…]/.test(c) && /^\s?$/.test(s.charAt(i + 1))) end = i + 1;
  }
  return end;
}
