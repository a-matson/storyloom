import { matchEntity } from '@core/memory/entities';
import type { Entity, Scene } from '@core/model/types';
import type { SceneRead } from '@core/schema/extraction';

/** `MEASURE_GROUPS=1` gives read A the backup's faction cards met by then as groups it may list (M21-4). */
const GROUPS = process.env['MEASURE_GROUPS'] === '1';

export interface GroupRow {
  groups?: { samples: number; listed: NonNullable<Scene['groups']>; factionsPresent: string[] };
}

/** The factions read A may list at action `i`, the `group` lookup `nextScene` takes, and the row that scores them. */
export function groupsAt(entities: readonly Entity[], i: number) {
  const factions = GROUPS ? entities.filter((e) => e.kind === 'faction' && e.firstSeen <= i) : [];
  const names = factions.map((f) => f.name);
  return {
    names,
    group: (s: string) => (matchEntity(factions, s) ? { id: s } : undefined),
    row: (samples: readonly { parsed?: { scene: SceneRead } | undefined }[], scene: Scene): GroupRow =>
      GROUPS
        ? {
            groups: {
              samples: samples.filter((s) => s.parsed?.scene.present.some((p) => names.includes(p))).length,
              listed: scene.groups ?? [],
              factionsPresent: scene.present.filter((p) => matchEntity(factions, p)),
            },
          }
        : {},
  };
}

/** Samples that listed a faction, and factions that reached `present` (the bar: 0). */
export const scoreGroups = (rows: readonly GroupRow[]) => ({
  groupSamples: rows.reduce((s, r) => s + (r.groups?.samples ?? 0), 0),
  factionsPresent: rows.reduce((s, r) => s + (r.groups?.factionsPresent.length ?? 0), 0),
});
