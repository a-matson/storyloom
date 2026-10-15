import type { Entity, PlotComponents, Scene } from '../model/types';
import { NOBODY, type SceneRead } from '../schema/extraction';
import { entityNamedIn } from './entities';
import { knownAs, norm, sceneIds, sceneNames, withPresence } from './names';

/** Location changes the Plot tab can show. [provisional] */
export const SCENE_LOG_CAP = 50;
export { PRESENCE_CAP } from './names';

/** The outermost place `e` is part of, so a room inside the current place is not a move. */
function outermost(places: readonly Entity[], e: Entity | undefined): Entity | undefined {
  const seen = new Set<string>();
  let p = e;
  while (p?.partOf && !seen.has(p.id)) {
    seen.add(p.id);
    const up: string = p.partOf;
    const next = places.find((x) => x.id === up);
    if (!next) break;
    p = next;
  }
  return p;
}

/** Whether `passage` names a stored name, by its card's aliases too ("the dragon"). */
export const namedIn =
  (entities: readonly Entity[], passage: string) =>
  (n: string): boolean =>
    entityNamedIn([entities.find((e) => e.name === n) ?? { name: n, aliases: [] }], passage) !== undefined;

/** The names a read says went away. */
export const leaversOf = (read: SceneRead): string[] => Object.keys(read.stay).filter((n) => read.stay[n] === 'left');

/**
 * The scene after one turn read at action `at`, and whether it changed place. `name` gives a listed name
 * as stored (an entity's name) or undefined for the player and non-names. Place identity comes from
 * `knownAs` over `places` (the read's old `moved` flag was true once for two real changes in P7c); the stored
 * location is the place's name, so paraphrases collapse. Nobody leaves without a `left` verdict, except
 * that a change of place keeps only the listed and who the read has here or asleep (C3: 27/30). The read changes someone's presence only
 * when `named` (the passage names them): a hand removal then holds (F17), and a character the passage
 * just does not mention is not "left" (M14-S2 replay). There is no clock: an old save's `time` is dropped.
 * Unchanged input returns `scene` itself.
 */
export function nextScene(
  scene: Scene | undefined,
  read: SceneRead,
  name: (s: string) => string | undefined,
  at: number,
  places: readonly Entity[],
  named: (n: string) => boolean,
): { scene: Scene | undefined; moved: boolean } {
  const said = read.location.trim();
  const was = scene?.location;
  const here = said ? knownAs(places, said) : undefined;
  const to = outermost(places, here);
  const from = outermost(places, was === undefined ? undefined : knownAs(places, was));
  const moved = said !== '' && (to && from ? to !== from : norm(here?.name ?? said) !== norm(was ?? ''));
  const location = !said ? was : (here?.name ?? (moved ? said : was));

  const names = (xs: readonly string[]) => xs.flatMap((x) => (x === NOBODY ? [] : (name(x) ?? [])));
  const before = scene?.present ?? [];
  const left = new Set(names(leaversOf(read)).filter(named));
  const listed = names(read.present).filter((p) => before.includes(p) || named(p));
  // On a move, who the read keeps "here" or "asleep" came along: a dragged, unconscious Minos was left out of `present`.
  const kept = moved ? before.filter((p) => read.stay[p] === 'here' || read.stay[p] === 'asleep') : before;
  const present = [...new Set([...kept, ...listed])].filter((p) => !left.has(p));
  const weather = read.weather === 'unchanged' ? scene?.weather : read.weather === 'none' ? undefined : read.weather;

  const next: Scene = {
    ...(location !== undefined && { location }),
    present,
    // Schema order, so an unchanged scene compares equal below. The read names no items: a move drops the old place's.
    ...(weather !== undefined && { weather }),
    ...(!moved && scene?.items && { items: scene.items }),
    ...(moved ? { since: at } : scene?.since !== undefined && { since: scene.since }),
  };
  if (!next.location && !next.present.length && !next.weather && !next.items) return { scene, moved: false };
  const { sourceId: _id, sourceHash: _hash, time: _time, ...rest } = scene ?? {};
  return { scene: JSON.stringify(next) === JSON.stringify(rest) ? scene : next, moved };
}

/**
 * `plot` with the scene a turn read gives, read from `source`, stored as ids (`sceneIds`, so a name
 * that got a card since resolves too); a change of place is logged by name, a change of who is present
 * in `presence`. `passage` is the text the read was given. Unchanged: `plot` itself.
 */
export function withScene(
  plot: PlotComponents,
  read: SceneRead,
  name: (s: string) => string | undefined,
  at: number,
  source: { sourceId: string; sourceHash: string },
  entities: readonly Entity[],
  passage: string,
): PlotComponents {
  const old = plot.scene;
  const was = old && sceneNames(old, entities);
  const places = entities.filter((e) => e.kind === 'place');
  const r = nextScene(was, read, name, at, places, namedIn(entities, passage));
  const scene = r.scene && sceneIds(r.scene, entities);
  if (!scene || (r.scene === was && JSON.stringify(scene) === JSON.stringify(old))) return plot;
  const where = r.scene?.location;
  const log = r.moved && where ? [...(plot.sceneLog ?? []), { at, location: where }].slice(-SCENE_LOG_CAP) : plot.sceneLog;
  const presence = withPresence(plot, scene.present, at);
  return { ...plot, scene: { ...scene, ...source }, ...(log && { sceneLog: log }), ...(presence && { presence }) };
}
