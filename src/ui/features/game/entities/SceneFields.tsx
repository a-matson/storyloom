import { sceneIds, sceneNames } from '@core/memory';
import type { Entity, PlotComponents, Scene } from '@core/model';
import { WEATHERS } from '@core/schema';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input, Select } from '@ui/components/ui/field';

const list = (s: string) =>
  s
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

/** Location changes shown under the scene. */
const TIMELINE = 5;

/** The turn read's scene as editable fields. Edits last until a later passage says otherwise. */
export function SceneFields({
  scene: stored,
  entities,
  log,
  api,
}: {
  scene: Scene;
  entities: readonly Entity[];
  log: NonNullable<PlotComponents['sceneLog']>;
  api: GameApi;
}) {
  // Shown and edited as names; stored as ids where a card matches, so a rename carries over.
  const scene = sceneNames(stored, entities);
  const set = (patch: Partial<Scene>) => api.updatePlot({ scene: sceneIds({ ...scene, ...patch }, entities) });
  return (
    <>
      <Input
        key={`location:${scene.location ?? ''}`}
        aria-label="Scene location"
        className="text-control"
        placeholder="Where the story is"
        defaultValue={scene.location ?? ''}
        onBlur={(e) => set({ location: e.target.value })}
      />
      <Input
        key={scene.present.join(',')}
        aria-label="Present"
        className="text-control"
        placeholder="Who is there, comma-separated"
        defaultValue={scene.present.join(', ')}
        onBlur={(e) => set({ present: list(e.target.value) })}
      />
      <Input
        key={`items:${scene.items?.join(',') ?? ''}`}
        aria-label="Items here"
        className="text-control"
        placeholder="Named items there, comma-separated"
        defaultValue={scene.items?.join(', ') ?? ''}
        onBlur={(e) => set({ items: list(e.target.value) })}
      />
      <Select aria-label="Weather" className="text-control" value={scene.weather ?? ''} onChange={(e) => set({ weather: e.target.value || undefined })}>
        <option value="">No weather</option>
        {/* An older save's free-text weather stays selectable until it is changed. */}
        {[...new Set([...WEATHERS, ...(scene.weather ? [scene.weather] : [])])].map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </Select>
      {log.length > 0 && (
        <ol aria-label="Scene timeline" className="text-muted-foreground text-xs">
          {log
            .slice(-TIMELINE)
            .toReversed()
            .map((e) => (
              <li key={`${e.at}:${e.location}`}>
                action {e.at} · {e.location}
              </li>
            ))}
        </ol>
      )}
    </>
  );
}
