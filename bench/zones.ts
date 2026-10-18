import { mergeEntity } from '@core/memory/entities';
import type { Entity, Scene } from '@core/model/types';
import type { SceneRead } from '@core/schema/extraction';

/** `MEASURE_ROOM=basement` scores rooms (M21-1); it also cards that room inside the start place, as a player who answered the inside-ask has it (M22-3). */
const ROOM = process.env['MEASURE_ROOM'];

export const withRoomCard = (places: Entity[]): Entity[] => {
  const start = places[0];
  return ROOM && start ? [...places, { ...mergeEntity(undefined, { name: `the ${ROOM}`, kind: 'place', description: '' }, 0), partOf: start.id }] : places;
};

/**
 * Samples whose scene has you in the room and everyone present before still present, none with you: the player
 * going down alone (M22-3). `step` is `nextScene` from the scene before.
 */
export function playerRoomOk(
  samples: readonly { parsed?: { scene: SceneRead } | undefined }[],
  before: Scene,
  step: (r: SceneRead) => Scene | undefined,
): number {
  if (!ROOM || !before.present.length) return 0;
  return samples.filter((s) => {
    const r = s.parsed && step(s.parsed.scene);
    return r?.zone?.toLowerCase().includes(ROOM) && before.present.every((p) => r.present.includes(p) && r.zones?.[p] !== undefined);
  }).length;
}
