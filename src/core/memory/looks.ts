import type { Assertion, Entity } from '../model/types';
import { newId } from '../model/types';
import { identityText, isCurrent, type AssertionOf } from './assertionIndex';

/** State keys that say how a character looks, in the order their tags are written. [provisional] */
export const LOOK_KEYS = ['species', 'build', 'eyes', 'hair', 'horns', 'scales', 'marks', 'wearing'] as const;

/** The other keys a model state change may set; `holder` is who carries an item (a name or "you"). [provisional] */
export const STATE_KEYS = ['location', 'holder', 'condition', 'posture', 'mood', 'role'] as const;

/** An item is held (`holder`) or at a place (`location`), never both: a value for one ends the other. */
export const rivalKey = (kind: Entity['kind'], key: string): string | undefined =>
  kind !== 'item' ? undefined : key === 'holder' ? 'location' : key === 'location' ? 'holder' : undefined;

/**
 * A subject's current look and state values by key, in store order, a later one over an earlier.
 * The legacy free-text look is no key, and a proposal (`seen: false`) is not current until accepted.
 */
export function currentStates(as: readonly Assertion[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of as) if (isCurrent(a) && a.seen !== false && (a.kind === 'state' || (a.kind === 'look' && a.key !== 'legacy'))) out[a.key] = a.value;
  return out;
}

/** "green" for `eyes` reads as a tag only with its key; "green eyes" already is one. */
const tag = (key: string, value: string) => (value.toLowerCase().includes(key) ? value : `${key}: ${value}`);

/** Current looks in `LOOK_KEYS` order, else the legacy free-text look. */
export function appearanceOf(as: readonly Assertion[]): string {
  const now = currentStates(as);
  const looks = LOOK_KEYS.flatMap((k) => (now[k]?.trim() ? [tag(k, now[k].trim())] : []));
  const legacy = as.findLast((a) => a.kind === 'look' && a.key === 'legacy' && isCurrent(a));
  return looks.length ? looks.join(', ') : legacy?.kind === 'look' ? legacy.value.trim() : '';
}

/** The entity as the image prompts read it: who it is as `description`, its current looks as `appearance`. */
export const withLooks = <E extends Entity>(e: E, as: readonly Assertion[]): E => ({ ...e, description: identityText(e, as), appearance: appearanceOf(as) });

/** `wearing` changes scene to scene, so it is a state, not a look; `legacy` is the old free-text look. */
export const isLook = (key: string): boolean => key === 'legacy' || (key !== 'wearing' && (LOOK_KEYS as readonly string[]).includes(key));

type Origin = 'id' | 'subject' | 'producer' | 'at' | 'paragraph' | 'span' | 'basis' | 'since' | 'until' | 'pinned' | 'seen';
/** What one kind of assertion says, without where it came from. */
export type Fields = { [K in Assertion['kind']]: Omit<AssertionOf<K>, Origin> }[Assertion['kind']];

export const valueOf = (key: string, value: string): Fields => ({ kind: isLook(key) ? 'look' : 'state', key, value });
/** A look or state value, not a proposal. */
export const isValue = (a: Assertion): a is AssertionOf<'look' | 'state'> => (a.kind === 'look' || a.kind === 'state') && a.seen !== false;

/** A line the player wrote (or set) about `subject`, at action index `at` (now). */
export const byPlayer = (subject: string, at: number, f: Fields): Assertion => ({
  id: newId('as_'),
  subject,
  producer: 'player',
  at,
  basis: 'player',
  since: at,
  ...f,
});

/** The player sets (or, with `''`, clears) a value at `at`: the key's current one ends, and an item's holder and place end each other. */
export function setValue(e: Pick<Entity, 'id' | 'kind'>, own: readonly Assertion[], key: string, value: string, at: number): Assertion[] {
  const rival = value.trim() ? rivalKey(e.kind, key) : undefined;
  const ended = own.map((a) => (isCurrent(a) && isValue(a) && (a.key === key || a.key === rival) ? { ...a, until: at } : a));
  return value.trim() ? [...ended, byPlayer(e.id, at, valueOf(key, value.trim()))] : ended;
}
