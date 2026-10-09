import type { ExtractionJson, Scene } from '../model/types';

const blank = (s: string | undefined) => !s?.trim();

/**
 * The scene after one helper reply. There is no clock: the extracted one never advanced, so a
 * stored `time` is dropped rather than sent stale. Unchanged input returns `scene` itself.
 */
export function nextScene(scene: Scene | undefined, reply: ExtractionJson, isName: (s: string) => boolean): Scene | undefined {
  const s = reply.scene;
  const location = blank(s?.location) ? scene?.location : s?.location?.trim();
  const present = s?.present?.map((n) => n.trim()).filter(isName);
  const weather = blank(s?.weather) ? scene?.weather : s?.weather?.trim();
  const next: Scene = {
    ...(location !== undefined && { location }),
    // A player's edit to the cast lasts until a reply names who is there.
    present: present !== undefined && present.length > 0 ? present : (scene?.present ?? []),
    ...(weather !== undefined && { weather }),
  };
  if (!next.location && !next.present.length && !next.weather) return scene;
  return JSON.stringify(next) === JSON.stringify(scene) ? scene : next;
}
