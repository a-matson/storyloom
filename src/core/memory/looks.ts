import type { Assertion, Entity, EntityFact } from '../model/types';
import { identityText, isCurrent } from './assertionIndex';

/** State keys that say how a character looks, in the order their tags are written. [provisional] */
export const LOOK_KEYS = ['species', 'build', 'eyes', 'hair', 'horns', 'scales', 'marks', 'wearing'] as const;

/** The other keys a model state change may set; `holder` is who carries an item (a name or "you"). [provisional] */
export const STATE_KEYS = ['location', 'holder', 'condition', 'posture', 'mood', 'role'] as const;

/** An item is held (`holder`) or at a place (`location`), never both: a value for one ends the other. */
export const rivalKey = (kind: Entity['kind'], key: string): string | undefined =>
  kind !== 'item' ? undefined : key === 'holder' ? 'location' : key === 'location' ? 'holder' : undefined;

export type CurrentState = EntityFact & { kind: 'state'; key: string; value: string; until?: undefined };

export const isCurrentState = (f: EntityFact): f is CurrentState => f.kind === 'state' && f.key !== undefined && f.value !== undefined && f.until === undefined;

/** The player's (and legacy) `state` map with each current state fact over it: what the fact writers merge against. */
export function factStates(e: Pick<Entity, 'state' | 'facts'>): Record<string, string> {
  return { ...e.state, ...Object.fromEntries(e.facts.filter(isCurrentState).map((f) => [f.key, f.value])) };
}

/** A subject's current look and state values by key, in store order, a later one over an earlier; the legacy free-text look is no key. */
export function currentStates(as: readonly Assertion[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of as) if (isCurrent(a) && (a.kind === 'state' || (a.kind === 'look' && a.key !== 'legacy'))) out[a.key] = a.value;
  return out;
}

/** "green" for `eyes` reads as a tag only with its key; "green eyes" already is one. */
const tag = (key: string, value: string) => (value.toLowerCase().includes(key) ? value : `${key}: ${value}`);

/** Current looks in `LOOK_KEYS` order, else the legacy free-text look. */
export function appearanceOf(as: readonly Assertion[]): string {
  const now = currentStates(as);
  const looks = LOOK_KEYS.flatMap((k) => (now[k]?.trim() ? [tag(k, now[k].trim())] : []));
  const legacy = as.find((a) => a.kind === 'look' && a.key === 'legacy' && isCurrent(a));
  return looks.length ? looks.join(', ') : legacy?.kind === 'look' ? legacy.value.trim() : '';
}

/** The entity as the image prompts read it: who it is as `description`, its current looks as `appearance`. */
export const withLooks = <E extends Entity>(e: E, as: readonly Assertion[]): E => ({ ...e, description: identityText(e, as), appearance: appearanceOf(as) });

/** The player sets (or, with `''`, clears) a state value: it goes in the map, and the model's current value for the key ends. */
export function setState(e: Entity, key: string, value: string): Pick<Entity, 'state' | 'facts'> {
  return {
    state: Object.fromEntries(Object.entries({ ...e.state, [key]: value }).filter(([, v]) => v !== '')),
    facts: e.facts.map((f) => (isCurrentState(f) && f.key === key ? { ...f, until: e.lastSeen } : f)),
  };
}
