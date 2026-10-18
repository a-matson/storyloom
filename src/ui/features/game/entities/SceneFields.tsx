import { sceneIds, sceneNames } from '@core/memory';
import type { Entity, PlotComponents, Scene } from '@core/model';
import { DayPart, WEATHERS } from '@core/schema';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input, Select } from '@ui/components/ui/field';

const list = (s: string) =>
  s
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

/** Location changes shown under the scene. */
const TIMELINE = 5;

/** The player's clock (`/wait`, `/time`): a part of the day and, once there is one, the day. No part: no time. */
function TimeFields({ time, set }: { time: Scene['time']; set: (time: Scene['time']) => void }) {
  return (
    <>
      <Select
        aria-label="Time of day"
        className="text-control"
        value={time?.part ?? ''}
        onChange={(e) => {
          const part = DayPart.options.find((p) => p === e.target.value);
          set(part && { day: time?.day ?? 1, part });
        }}
      >
        <option value="">No time</option>
        {DayPart.options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      {time && (
        <Input
          key={`day:${time.day}`}
          aria-label="Day"
          type="number"
          min={1}
          className="text-control"
          defaultValue={time.day}
          onBlur={(e) => {
            const day = Number.parseInt(e.target.value, 10);
            if (day >= 1) set({ ...time, day });
          }}
        />
      )}
    </>
  );
}

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
        onBlur={(e) => {
          if (e.target.value === (scene.location ?? '')) return;
          // A new location leaves your room behind.
          const { zone: _, ...rest } = scene;
          api.updatePlot({ scene: sceneIds({ ...rest, location: e.target.value }, entities) });
        }}
      />
      {/* Set by a read or `/travel <room>`; no field of its own. */}
      {scene.zone && <p className="text-muted-foreground text-xs">You: {scene.zone}</p>}
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
      <TimeFields time={scene.time} set={(time) => set({ time })} />
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
