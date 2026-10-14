import type { Entity, Scene } from '../model/types';
import type { AssertionIndex } from './assertionIndex';
import { knownAs } from './names';
import { currentStates } from './looks';
import { YOU } from './you';

export { YOU };

/** Items each scene list names. [provisional] */
export const MAX_ITEMS = 5;

const norm = (s: string) => {
  const t = s.trim().toLowerCase();
  return /^(?:you|yourself|the player)$/.test(t) ? YOU : t.replace(/^the /, '');
};

/** Whether `a` and `b` mean the same entity, or the same words when neither resolves to one. */
const same = (entities: readonly Entity[], a: string, b: string) => {
  const x = knownAs(entities, a);
  const y = knownAs(entities, b);
  return x || y ? x === y : norm(a) === norm(b);
};

const items = (entities: readonly Entity[]) => entities.filter((e) => e.kind === 'item');
export const holderOf = (ix: AssertionIndex, e: Entity): string | undefined => currentStates(ix.of(e.id))['holder'];
const placeOf = (ix: AssertionIndex, e: Entity): string | undefined => currentStates(ix.of(e.id))['location'];

/** Items `holder` (a name, or `YOU`) holds. */
export function heldBy(entities: readonly Entity[], ix: AssertionIndex, holder: string): Entity[] {
  return items(entities).filter((i) => {
    const h = holderOf(ix, i);
    return h !== undefined && same(entities, h, holder);
  });
}

/** Items at `place` that nobody holds. */
export function itemsAt(entities: readonly Entity[], ix: AssertionIndex, place: string): Entity[] {
  return items(entities).filter((i) => {
    const p = placeOf(ix, i);
    return p !== undefined && holderOf(ix, i) === undefined && same(entities, p, place);
  });
}

/**
 * The items here: those the scene names (as written when no card has the name), then those stored
 * at its place or held by someone present; never the player's own.
 */
export function itemsIn(scene: Scene, entities: readonly Entity[], ix: AssertionIndex): (Entity | string)[] {
  const mine = new Set(heldBy(entities, ix, YOU));
  const found = [
    ...(scene.items ?? []).map((n) => knownAs(items(entities), n) ?? n),
    ...(scene.location ? itemsAt(entities, ix, scene.location) : []),
    ...scene.present.flatMap((p) => heldBy(entities, ix, p)),
  ];
  return [...new Set(found)].filter((x) => typeof x === 'string' || !mine.has(x)).slice(0, MAX_ITEMS);
}

/** The scene's `Here:` list, a held item with its holder ("Horn (Korthak)"). */
export function itemsHere(scene: Scene, entities: readonly Entity[], ix: AssertionIndex): string[] {
  const label = (e: Entity) => {
    const h = holderOf(ix, e);
    return h ? `${e.name} (${knownAs(entities, h, ix)?.name ?? h})` : e.name;
  };
  return itemsIn(scene, entities, ix).map((x) => (typeof x === 'string' ? x : label(x)));
}
