import type { Adventure, Assertion, Entity } from '../model/types';
import { newId } from '../model/types';
import { EVENT_YOU, MAX_EVENTS, type ExtractedEvent } from '../schema/extraction';
import { actionStoryText } from '../text/formatting';
import type { AssertionOf } from './assertionIndex';
import type { MemoryRange } from './memoryBank';
import { entityNamedIn, namesOf, norm, words } from './names';
import { playerName, YOU } from './you';

// Reached only through `batch.ts` and `summary.ts`, so it stays off the start-up bundle.

/** The first sentence of `text` that holds `name` as whole words: what the event rests on. */
const sentenceWith = (text: string, name: string): string | undefined =>
  text
    .match(/[^.!?]+[.!?]*/g)
    ?.map((s) => s.trim())
    .find((s) => words(s).includes(words(name)));

/** The events of actions `[from, to)`, oldest first: what the summary is given beside the memories. */
export const eventsSince = (all: readonly Assertion[], from: number, to: number): AssertionOf<'event'>[] =>
  all.filter((a): a is AssertionOf<'event'> => a.kind === 'event' && a.at >= from && a.at < to).toSorted((a, b) => a.at - b.at);

const key = (at: number, who: readonly string[], text: string) => `${at}|${who.toSorted().join(',')}|${norm(text)}`;

/**
 * Store the batch reply's events: one stands when its `at` is in `range` and that action names one of
 * who took part (`You` by "you" or the player's name, only the name in third person), and rests on the first sentence
 * that does. `labels` maps the cast labels the reply used to entities; a character the event's own
 * words and that action name joins who took part, first unless the event opens with "you". Runs after
 * the entity fold, so a character this reply introduced is known. A repeat of a stored event
 * (same action, who and text) is skipped. Returns how many were stored; `reject` hears the rest.
 */
export function foldEvents(
  adventure: Adventure,
  events: readonly ExtractedEvent[],
  range: MemoryRange,
  labels: ReadonlyMap<string, Entity>,
  reject: (who: string, what: string) => void,
): number {
  const name = playerName(adventure);
  // A second-person story still says "you" beside the opening's name; a blank stays out of `named`.
  const you = name && adventure.plot.thirdPerson?.enabled ? [name] : [name ?? '', 'you'];
  const byId = new Map(adventure.entities.map((e) => [e.id, e]));
  const characters = adventure.entities.filter((e) => e.kind === 'character');
  const seen = new Set(adventure.assertions.flatMap((a) => (a.kind === 'event' ? [key(a.at, a.who, a.text)] : [])));
  const added: Assertion[] = [];
  for (const e of events.slice(0, MAX_EVENTS)) {
    const action = e.at >= range.fromAction && e.at < range.toAction ? adventure.actions[e.at] : undefined;
    const story = action === undefined ? '' : actionStoryText(action);
    const text = words(story);
    const what = e.what.trim();
    const listed = [...new Set(e.who.flatMap((w) => (w === EVENT_YOU ? [YOU] : (labels.get(w)?.id ?? []))))];
    // A character met in this range is no cast name yet, so the reply could not list it; the event's words name it
    // ("Minos shows you a photograph", who: You). [measured: 2026-10-17-batch-m19-5-at600.json]
    const doer = entityNamedIn(characters, what);
    const who =
      doer && !listed.includes(doer.id) && entityNamedIn([doer], story) ? (/^you\b/i.test(what) ? [...listed, doer.id] : [doer.id, ...listed]) : listed;
    // The longest name of anyone who took part that the action holds.
    const named = who
      .flatMap((id) => (id === YOU ? you : namesOf(byId.get(id) ?? { name: '', aliases: [] })))
      .filter((n) => n.trim() !== '' && text.includes(words(n)))
      .toSorted((a, b) => b.length - a.length)[0];
    const [subject] = who;
    if (action === undefined || named === undefined || subject === undefined || !what || seen.has(key(e.at, who, what))) {
      reject(e.who.join(', '), e.what);
      continue;
    }
    seen.add(key(e.at, who, what));
    const span = sentenceWith(actionStoryText(action), named);
    added.push({ id: newId('as_'), subject, producer: 'batch', at: e.at, ...(span && { span }), basis: 'stated', since: e.at, kind: 'event', text: what, who });
  }
  if (added.length) adventure.assertions = [...adventure.assertions, ...added];
  return added.length;
}
