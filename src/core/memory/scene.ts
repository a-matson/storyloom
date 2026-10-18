import type { Entity, PlotComponents, Scene } from '../model/types';
import { NOBODY, type SceneRead, type Verdict } from '../schema/extraction';
import { entityNamedIn } from './entities';
import { groupCount } from './groups';
import { knownAs, matchEntity, norm, outermost, sameRoom, sceneIds, sceneNames, withPresence } from './names';

type Group = NonNullable<Scene['groups']>[number];

/** Location changes the Plot tab can show. [provisional] */
export const SCENE_LOG_CAP = 50;
export { PRESENCE_CAP } from './names';

/** Whether `passage` names a stored name, by its card's aliases too ("the dragon"). */
export const namedIn =
  (entities: readonly Entity[], passage: string) =>
  (n: string): boolean =>
    entityNamedIn([entities.find((e) => e.name === n) ?? { name: n, aliases: [] }], passage) !== undefined;

/** A verdict's word: a room counts as `left`, as it did before rooms (M21-1). */
const wordOf = (v: Verdict | undefined) => (typeof v === 'object' ? 'left' : v);
/** The room a verdict names, else "". */
export const roomIn = (v: Verdict | undefined): string => (typeof v === 'object' ? v.room : '');

/** The names a read says went away, to another room too. */
export const leaversOf = (read: SceneRead): string[] => Object.keys(read.stay).filter((n) => wordOf(read.stay[n]) === 'left');

/**
 * The scene after one turn read at action `at`, and whether it changed place. `name` gives a listed name
 * as stored (an entity's name) or undefined for the player and non-names. Place identity comes from
 * `knownAs` over `places` (the read's old `moved` flag was true once for two real changes in P7c); the stored
 * location is the place's name, so paraphrases collapse. Nobody leaves without a `left` verdict, except
 * that a change of place keeps only the listed and who the read has here or asleep (C3: 27/30). The read changes someone's presence only
 * when `named` (the passage names them): a hand removal then holds (F17), and a character the passage
 * just does not mention is not "left" (M14-S2 replay); so does a room (`zones`), which `here` clears. `time` is the player's (`clock.ts`): a read or a move keeps it.
 * Verdicts merge per stored name (M30-5): `here`, `asleep` or listed under any alias beats `left` under another; and a `stale`
 * character (unnamed for several outputs) leaves unless asleep, so a read cannot keep someone present by habit.
 * Unchanged input returns `scene` itself.
 */
export function nextScene(
  scene: Scene | undefined,
  read: SceneRead,
  name: (s: string) => string | undefined,
  at: number,
  places: readonly Entity[],
  named: (n: string) => boolean,
  group: (s: string) => Group | undefined = () => undefined,
  stale: (n: string) => boolean = () => false,
): { scene: Scene | undefined; moved: boolean } {
  const said = read.location.trim();
  const was = scene?.location;
  const here = said ? knownAs(places, said) : undefined;
  const to = outermost(places, here);
  const from = outermost(places, was === undefined ? undefined : knownAs(places, was));
  const moved = said !== '' && (to && from ? to !== from : norm(here?.name ?? said) !== norm(was ?? ''));
  // A room of this place is your zone and the location stays the place; the place itself clears it, a move drops it (M22-3).
  const inside = to !== undefined && to === from;
  const location = !said ? was : inside ? to.name : (here?.name ?? (moved ? said : was));
  const zone = moved ? undefined : inside ? (here === to ? undefined : here?.name) : scene?.zone;
  // Who did not follow you stays in the room you left.
  const behind = zone === scene?.zone ? undefined : (scene?.zone ?? was);

  const names = (xs: readonly string[]) => xs.flatMap((x) => (x === NOBODY ? [] : (name(x) ?? [])));
  const before = scene?.present ?? [];
  // A room of this place keeps them present there; your room is `here`, another place is gone. A move drops the rooms.
  const roomOf = (where: string): string | undefined => {
    const w = where.trim();
    const p = w ? knownAs(places, w) : undefined;
    return !w || moved || (p && outermost(places, p) !== from) ? undefined : w;
  };
  const rooms = new Map<string, string>();
  for (const n of leaversOf(read)) {
    const room = roomOf(roomIn(read.stay[n]));
    const id = room === undefined ? undefined : name(n);
    if (room !== undefined && id && named(id)) rooms.set(id, room);
  }
  // A faction listed is its members here (F21), never a character; listed each read or gone. [provisional]
  const groups = read.present.flatMap((x) => group(x) ?? []);
  const listed = names(read.present.filter((x) => !group(x))).filter((p) => before.includes(p) || named(p));
  const saying = (w: Verdict) => new Set(names(Object.keys(read.stay).filter((n) => read.stay[n] === w)));
  const asleep = saying('asleep');
  const held = new Set([...saying('here'), ...asleep]);
  // Imperium `left` and its alias Baron Henrik Drake `here` in one read wrote a gap (M30-5): any staying verdict wins.
  const left = new Set(names(leaversOf(read)).filter((p) => named(p) && !rooms.has(p) && !held.has(p) && !listed.includes(p)));
  // On a move, who the read keeps "here" or "asleep" came along: a dragged, unconscious Minos was left out of `present`.
  const kept = moved ? before.filter((p) => held.has(p)) : before;
  const present = [...new Set([...kept, ...listed])].filter((p) => !left.has(p) && (asleep.has(p) || !stale(p)));
  const back = new Set([...saying('here')].filter(named));
  const zones = moved
    ? []
    : present.flatMap((p) => {
        const room = rooms.get(p) ?? (back.has(p) ? undefined : (scene?.zones?.[p] ?? (before.includes(p) ? behind : undefined)));
        return room !== undefined && !sameRoom(places, room, zone ?? location) ? [[p, room] as const] : [];
      });
  const weather = read.weather === 'unchanged' ? scene?.weather : read.weather === 'none' ? undefined : read.weather;

  const next: Scene = {
    ...(location !== undefined && { location }),
    present,
    ...(zones.length > 0 && { zones: Object.fromEntries(zones) }),
    ...(zone !== undefined && { zone }),
    ...(groups.length > 0 && { groups }),
    ...(scene?.time && { time: scene.time }),
    // Schema order, so an unchanged scene compares equal below. The read names no items: a move drops the old place's.
    ...(weather !== undefined && { weather }),
    ...(!moved && scene?.items && { items: scene.items }),
    ...(moved ? { since: at } : scene?.since !== undefined && { since: scene.since }),
  };
  if (!next.location && !next.present.length && !next.weather && !next.items) return { scene, moved: false };
  const { sourceId: _id, sourceHash: _hash, ...rest } = scene ?? {};
  return { scene: JSON.stringify(next) === JSON.stringify(rest) ? scene : next, moved };
}

/**
 * `plot` with the scene a turn read gives, read from `source`, stored as ids (`sceneIds`, so a name
 * that got a card since resolves too); a change of place is logged by name, a change of who is present
 * in `presence`. `passage` is the text the read was given; `stale` as in `nextScene`. Unchanged: `plot` itself.
 */
export function withScene(
  plot: PlotComponents,
  read: SceneRead,
  name: (s: string) => string | undefined,
  at: number,
  source: { sourceId: string; sourceHash: string },
  entities: readonly Entity[],
  passage: string,
  stale?: (n: string) => boolean,
): PlotComponents {
  const old = plot.scene;
  const was = old && sceneNames(old, entities);
  const places = entities.filter((e) => e.kind === 'place');
  const factions = entities.filter((e) => e.kind === 'faction');
  const group = (s: string): Group | undefined => {
    const f = matchEntity(factions, s);
    const count = f && groupCount(passage, f);
    return f && { id: f.name, ...(count !== undefined && { count }) };
  };
  const r = nextScene(was, read, name, at, places, namedIn(entities, passage), group, stale);
  const scene = r.scene && sceneIds(r.scene, entities);
  if (!scene || (r.scene === was && JSON.stringify(scene) === JSON.stringify(old))) return plot;
  const where = r.scene?.location;
  const log = r.moved && where ? [...(plot.sceneLog ?? []), { at, location: where }].slice(-SCENE_LOG_CAP) : plot.sceneLog;
  const presence = withPresence(plot, scene, at);
  return { ...plot, scene: { ...scene, ...source }, ...(log && { sceneLog: log }), ...(presence && { presence }) };
}
