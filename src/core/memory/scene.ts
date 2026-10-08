import type { DayPart, ExtractionJson, Scene } from '../model/types';

const PARTS: DayPart[] = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];

type Time = NonNullable<Scene['time']>;

/** Move the clock by a stated delta; parts wrap through the day and carry into `day`. */
export function advanceTime(time: Time, delta: Partial<ExtractionJson['timeDelta']>): Time {
  const days = Math.max(0, delta?.days ?? 0);
  const parts = Math.max(0, delta?.parts ?? 0);
  if (!days && !parts) return time;
  const i = PARTS.indexOf(time.part) + parts;
  return { day: time.day + days + Math.floor(i / PARTS.length), part: PARTS[i % PARTS.length] ?? time.part };
}

const blank = (s: string | undefined) => !s?.trim();

/**
 * The scene after one helper reply. The clock moves only by an explicit `timeDelta`: guessing
 * elapsed time from prose is what put V-2's story two days behind. A stated time of day only
 * starts a clock that does not exist yet. Unchanged input returns `scene` itself.
 */
export function nextScene(scene: Scene | undefined, reply: ExtractionJson, isName: (s: string) => boolean): Scene | undefined {
  const s = reply.scene;
  const location = blank(s?.location) ? scene?.location : s?.location?.trim();
  const present = s?.present?.map((n) => n.trim()).filter(isName);
  const time = scene?.time ? advanceTime(scene.time, reply.timeDelta) : s?.timeOfDay ? { day: 1, part: s.timeOfDay } : undefined;
  const weather = blank(s?.weather) ? scene?.weather : s?.weather?.trim();
  const next: Scene = {
    ...(location !== undefined && { location }),
    // A player's edit to the cast lasts until a reply names who is there.
    present: present !== undefined && present.length > 0 ? present : (scene?.present ?? []),
    ...(time && { time }),
    ...(weather !== undefined && { weather }),
  };
  if (!next.location && !next.present.length && !next.time && !next.weather) return scene;
  return JSON.stringify(next) === JSON.stringify(scene) ? scene : next;
}
