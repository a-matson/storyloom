import type { z } from 'zod/mini';
import type { PlotComponents, Scene } from '../model/types';
import type { TurnScene } from '../schema/extraction';
import { EMPTY_VALUE } from './fold';

/** Weather is only weather: the 12B also wrote "late-night traffic" there. Prefixes, so "rainy" and "windy" match. [provisional] */
const WEATHER = /\b(?:rain|snow|storm|wind|fog|mist|sun|cloud|heat|cold|hail|drizzle|thunder|clear)/i;

/** Location changes the Plot tab can show. [provisional] */
export const SCENE_LOG_CAP = 50;

const value = (s: string | undefined) => {
  const t = s?.trim();
  return t && !EMPTY_VALUE.test(t) ? t : undefined;
};

/**
 * The scene after one turn read at action `at`. `name` gives a present name as stored (an entity's
 * name) or undefined for the player and non-names. There is no clock: an old save's `time` is
 * dropped rather than sent stale. Unchanged input returns `scene` itself.
 */
export function nextScene(scene: Scene | undefined, s: z.output<typeof TurnScene>, name: (s: string) => string | undefined, at: number): Scene | undefined {
  const location = value(s.location) ?? scene?.location;
  const moved = location !== scene?.location;
  const said = value(s.weather);
  const weather = said && WEATHER.test(said) ? said : scene?.weather;
  // A player's edit lasts until a reply names who is there; an empty list in a new place means nobody is.
  const list = (xs: string[] | undefined, old: string[] | undefined, clean: (x: string) => string | undefined) => {
    const l = xs && [...new Set(xs.flatMap((x) => clean(x) ?? []))];
    return l && (l.length > 0 || moved) ? l : old;
  };
  const present = list(s.present, scene?.present, (x) => {
    const v = value(x);
    return v && name(v);
  });
  const items = list(s.items, scene?.items, value);
  const next: Scene = {
    ...(location !== undefined && { location }),
    present: present ?? [],
    // Schema order, so an unchanged scene compares equal below.
    ...(weather !== undefined && { weather }),
    ...(items && items.length > 0 ? { items } : {}),
    ...(moved ? { since: at } : scene?.since !== undefined && { since: scene.since }),
  };
  if (!next.location && !next.present.length && !next.weather && !next.items) return scene;
  const { sourceId: _id, sourceHash: _hash, time: _time, ...was } = scene ?? {};
  return JSON.stringify(next) === JSON.stringify(was) ? scene : next;
}

/** `plot` with the scene a turn read gives, read from `source`; a location change is logged. Unchanged: `plot` itself. */
export function withScene(
  plot: PlotComponents,
  s: z.output<typeof TurnScene>,
  name: (s: string) => string | undefined,
  at: number,
  source: { sourceId: string; sourceHash: string },
): PlotComponents {
  const old = plot.scene;
  const scene = nextScene(old, s, name, at);
  if (!scene || scene === old) return plot;
  const moved = scene.location !== undefined && scene.location !== old?.location;
  const log = moved && scene.location ? [...(plot.sceneLog ?? []), { at, location: scene.location }].slice(-SCENE_LOG_CAP) : plot.sceneLog;
  return { ...plot, scene: { ...scene, ...source }, ...(log && { sceneLog: log }) };
}
