import type { Entity, PlotComponents, Scene } from '../model/types';
import { DayPart } from '../schema/adventure';
import { knownAs, outermost, sameRoom, sceneIds, sceneNames, withPresence } from './names';
import { SCENE_LOG_CAP } from './scene';

// The player's clock (M21-2): commands set `scene.time`, no read writes it, the model is only told.

type Time = NonNullable<Scene['time']>;
type Part = Time['part'];
export type Wait = { n: number; unit: 'minutes' | 'hours' | 'days' } | { until: Part };

const PARTS = DayPart.options;
/** Six parts over 24 hours. [provisional] */
const HOURS_PER_PART = 4;
/** Where an adventure with no time starts. [provisional] */
const START: Time = { day: 1, part: 'morning' };

/** A `/wait` this long (≈ 6 h at four hours a part) ends moods, postures and effects. [provisional] */
const WAIT_ENDS_PARTS = 2;

export const formatTime = (t: Time): string => `Day ${t.day}, ${t.part}`;

/** Parts from `from` to `to`; negative when `to` is earlier. */
export const elapsedParts = (from: Time | undefined, to: Time): number => {
  const f = from ?? START;
  return (to.day - f.day) * PARTS.length + PARTS.indexOf(to.part) - PARTS.indexOf(f.part);
};

/** Whether a clock skip ends transient states: a `wait` of `WAIT_ENDS_PARTS`, a set time any later part. */
export const skipEnds = (from: Time | undefined, to: Time, by: 'wait' | 'time'): boolean => elapsedParts(from, to) >= (by === 'wait' ? WAIT_ENDS_PARTS : 1);

/** `time` after a wait; an `until` lands on the next such part, so the same or an earlier part is tomorrow. */
export function advance(time: Time | undefined, by: Wait): Time {
  const t = time ?? START;
  const at = PARTS.indexOf(t.part);
  if ('until' in by) {
    const to = PARTS.indexOf(by.until);
    return { day: t.day + (to > at ? 0 : 1), part: by.until };
  }
  if (by.unit === 'days') return { day: t.day + by.n, part: t.part };
  const step = by.unit === 'hours' ? Math.round(by.n / HOURS_PER_PART) : 0;
  const total = at + step;
  return { day: t.day + Math.floor(total / PARTS.length), part: PARTS[total % PARTS.length] ?? t.part };
}

const partIn = (s: string): Part | undefined => PARTS.find((p) => new RegExp(`\\b${p}\\b`).test(s));

/** `3 hours`, `an hour`, `30 minutes`, `2 days`, `until night`; junk is undefined. */
export function parseWait(text: string): Wait | undefined {
  const s = text.trim().toLowerCase();
  const until = /^until\s+(\w+)$/.exec(s)?.[1];
  if (until !== undefined) {
    const part = PARTS.find((p) => p === until);
    return part && { until: part };
  }
  const m = /^(\d+|an?)\s*(minute|min|hour|hr|day)s?$/.exec(s);
  if (!m?.[1] || !m[2]) return undefined;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  return { n, unit: m[2].startsWith('m') ? 'minutes' : m[2] === 'day' ? 'days' : 'hours' };
}

/** `evening, day 2` or `day 2 evening`; without a day, `now`'s (else day 1). */
export function parseTime(text: string, now?: Time): Time | undefined {
  const s = text.trim().toLowerCase();
  const part = partIn(s);
  const day = /\bday\s+(\d+)\b/.exec(s)?.[1];
  return part && { day: day ? Number(day) : (now?.day ?? START.day), part };
}

/** `the docks alone` → the place and whether the company stays behind. */
export function parseTravel(text: string): { place: string; alone: boolean } | undefined {
  const m = /^(.*?)(?:\s+alone)?$/is.exec(text.trim());
  const place = m?.[1]?.trim() ?? '';
  return place && place.toLowerCase() !== 'alone' ? { place, alone: /\salone$/i.test(text.trim()) } : undefined;
}

/**
 * `plot` moved to `place` from action `at`: a known place by id (as `sceneIds`), else as written; logged like a read's move.
 * A room of the current place (or the place itself) only sets your `zone`: no move, and alone the company stays in the room you left.
 */
export function travel(plot: PlotComponents, entities: readonly Entity[], place: string, at: number, alone: boolean): PlotComponents {
  const places = entities.filter((e) => e.kind === 'place');
  const to = knownAs(places, place);
  const name = to?.name;
  const was = plot.scene;
  const top = outermost(places, to);
  if (was?.location !== undefined && top && top === outermost(places, places.find((p) => p.id === was.location) ?? knownAs(places, was.location))) {
    const named = sceneNames(was, entities);
    const zone = to === top ? undefined : to?.name;
    const zones = was.present.flatMap((p) => {
      const room = was.zones?.[p] ?? (alone && zone !== named.zone ? (named.zone ?? named.location) : undefined);
      return room !== undefined && !sameRoom(places, room, zone ?? named.location) ? [[p, room] as const] : [];
    });
    const { zones: _zones, zone: _zone, ...rest } = was;
    const scene = { ...rest, location: top.id, ...(zones.length > 0 && { zones: Object.fromEntries(zones) }), ...(zone !== undefined && { zone }) };
    const presence = withPresence(plot, scene, at);
    return { ...plot, scene, ...(presence && { presence }) };
  }
  const scene = sceneIds(
    {
      location: name ?? place,
      present: alone ? [] : (was?.present ?? []),
      ...(was?.time && { time: was.time }),
      ...(was?.weather && { weather: was.weather }),
      since: at,
    },
    entities,
  );
  // A move drops the rooms, so who was in another one is with you again.
  const presence = withPresence(plot, scene, at);
  const sceneLog = [...(plot.sceneLog ?? []), { at, location: name ?? place }].slice(-SCENE_LOG_CAP);
  return { ...plot, scene, sceneLog, ...(presence && { presence }) };
}
