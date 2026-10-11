import type { Entity, EntityFact } from '../model/types';

/** State keys that say how a character looks, in the order their tags are written. [provisional] */
export const LOOK_KEYS = ['species', 'build', 'eyes', 'hair', 'horns', 'scales', 'marks', 'wearing'] as const;

/** The other keys a model state change may set. [provisional] */
export const STATE_KEYS = ['location', 'condition', 'posture', 'mood', 'role'] as const;

export type CurrentState = EntityFact & { kind: 'state'; key: string; value: string; until?: undefined };

export const isCurrentState = (f: EntityFact): f is CurrentState => f.kind === 'state' && f.key !== undefined && f.value !== undefined && f.until === undefined;

/** The player's (and legacy) `state` map with each current state fact over it. */
export function currentStates(e: Pick<Entity, 'state' | 'facts'>): Record<string, string> {
  return { ...e.state, ...Object.fromEntries(e.facts.filter(isCurrentState).map((f) => [f.key, f.value])) };
}

/** "green" for `eyes` reads as a tag only with its key; "green eyes" already is one. */
const tag = (key: string, value: string) => (value.toLowerCase().includes(key) ? value : `${key}: ${value}`);

/** Current look facts in `LOOK_KEYS` order, else the legacy free-text `appearance`. */
export function appearanceOf(e: Pick<Entity, 'appearance' | 'facts'>): string {
  const now = new Map(e.facts.filter(isCurrentState).map((f) => [f.key, f.value.trim()]));
  const looks = LOOK_KEYS.flatMap((k) => (now.get(k) ? [tag(k, now.get(k) ?? '')] : []));
  return looks.length ? looks.join(', ') : (e.appearance?.trim() ?? '');
}

/** The player sets (or, with `''`, clears) a state value: it goes in the map, and the model's current value for the key ends. */
export function setState(e: Entity, key: string, value: string): Pick<Entity, 'state' | 'facts'> {
  return {
    state: Object.fromEntries(Object.entries({ ...e.state, [key]: value }).filter(([, v]) => v !== '')),
    facts: e.facts.map((f) => (isCurrentState(f) && f.key === key ? { ...f, until: e.lastSeen } : f)),
  };
}
