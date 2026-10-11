import type { Entity, Scene } from '../model/types';
import { knownAs } from './entities';
import { currentStates, rivalKey, setState } from './looks';

/** The `holder` value that means the player. */
export const YOU = 'you';

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
export const holderOf = (e: Entity): string | undefined => currentStates(e)['holder'];
const placeOf = (e: Entity): string | undefined => currentStates(e)['location'];

/** Items `holder` (a name, or `YOU`) holds. */
export function heldBy(entities: readonly Entity[], holder: string): Entity[] {
  return items(entities).filter((i) => {
    const h = holderOf(i);
    return h !== undefined && same(entities, h, holder);
  });
}

/** Items at `place` that nobody holds. */
export function itemsAt(entities: readonly Entity[], place: string): Entity[] {
  return items(entities).filter((i) => {
    const p = placeOf(i);
    return p !== undefined && holderOf(i) === undefined && same(entities, p, place);
  });
}

/** The player sets where an item is (`''` clears it); a holder or a place, so a value ends the rival key. */
export function setWhere(e: Entity, key: 'holder' | 'location', value: string): Pick<Entity, 'state' | 'facts'> {
  const rival = rivalKey(e.kind, key);
  return setState(value && rival ? { ...e, ...setState(e, rival, '') } : e, key, value);
}

/**
 * The scene's `Here:` list: the items it names as written, then those stored at its place or held
 * by someone present, a held one with its holder ("Horn (Korthak)"); never the player's own.
 */
export function itemsHere(scene: Scene, entities: readonly Entity[]): string[] {
  const mine = new Set(heldBy(entities, YOU));
  const found = [
    ...(scene.items ?? []).map((n) => knownAs(items(entities), n) ?? n),
    ...(scene.location ? itemsAt(entities, scene.location) : []),
    ...scene.present.flatMap((p) => heldBy(entities, p)),
  ];
  const label = (e: Entity) => {
    const h = holderOf(e);
    return h ? `${e.name} (${knownAs(entities, h)?.name ?? h})` : e.name;
  };
  return [...new Set(found)].flatMap((x) => (typeof x === 'string' ? [x] : mine.has(x) ? [] : [label(x)])).slice(0, MAX_ITEMS);
}
