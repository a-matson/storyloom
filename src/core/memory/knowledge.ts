import { echoes, ECHO_WORDS, shared } from '../context/redact';
import { UNAWARE } from '../context/witness';
import type { Assertion, Entity, PlotComponents } from '../model/types';
import { isCurrent, type AssertionOf } from './assertionIndex';
import { presentAt, secretsOf, type Secret } from './secrets';
import { YOU } from './you';

type Event = AssertionOf<'event'>;
interface Store {
  plot: PlotComponents;
  assertions: readonly Assertion[];
}

/** Words a `knows:` clause keeps of the event. [provisional] */
export const KNOWS_WORDS = 20;

const eventsIn = (as: Store['assertions']) =>
  as.filter((a): a is Event => a.kind === 'event' && isCurrent(a) && a.seen !== false).toSorted((a, b) => a.at - b.at);

/** In another room at `at` (rooms are only the current scene's, so only since its last move), or asleep then. */
function missed(id: string, at: number, adv: Store): boolean {
  const scene = adv.plot.scene;
  const room = at >= (scene?.since ?? Infinity) ? scene?.zones?.[id] : undefined;
  if (room !== undefined && room !== scene?.zone) return true;
  return adv.assertions.some(
    (a) =>
      a.subject === id &&
      a.kind === 'state' &&
      a.key === 'condition' &&
      a.seen !== false &&
      UNAWARE.test(a.value) &&
      a.since <= at &&
      at < (a.until ?? Infinity),
  );
}

/**
 * Who knows an event, derived, never stored: a secret marked on its action that retells it says (an explicit tell);
 * else whoever took part or was present, less anyone in another room or asleep then. You always.
 */
export function knownByOf(e: Event, adv: Store): string[] {
  const told = secretsOf(adv.assertions).find((s) => s.at === e.at && echoes(e.text, s.text));
  if (told) return told.knownBy;
  const ids = new Set([...e.who, ...presentAt(adv.plot.presence, e.at)]);
  return [YOU, ...[...ids].filter((id) => id !== YOU && !missed(id, e.at, adv))];
}

/** The events `id` knows of, by `at`. */
export const knowledgeOf = (id: string, adv: Store): Event[] => eventsIn(adv.assertions).filter((e) => knownByOf(e, adv).includes(id));

/**
 * `knows: <event>` for the newest event the player's `input` touches (`ECHO_WORDS` shared words) that `id` knows and
 * another character in `cast` does not. Never one a `cut` secret covers: quoting it is the leak M13-9 found.
 */
export function knowsClause(id: string, cast: readonly Entity[], adv: Store, input: string, cut: readonly Secret[]): string | undefined {
  const others = cast.filter((c) => c.kind === 'character' && c.id !== id);
  const gap = (k: string[]) => k.includes(id) && others.some((o) => !k.includes(o.id));
  const hit = eventsIn(adv.assertions).findLast(
    (e) => shared(e.text, input) >= ECHO_WORDS && !cut.some((s) => s.at === e.at || echoes(e.text, s.text)) && gap(knownByOf(e, adv)),
  );
  return hit && `knows: ${hit.text.trim().split(/\s+/).slice(0, KNOWS_WORDS).join(' ')}`;
}
