import { renderScene } from '@core/context';
import { sceneIds, sceneNames } from '@core/memory';
import type { Entity, PlotComponents, Scene, ScriptState } from '@core/model';
import { WEATHERS } from '@core/schema';
import { tokenizer } from '@app/services';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { Section } from './Section';

const list = (s: string) =>
  s
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

/** Location changes shown under the scene. */
const TIMELINE = 5;

type PlaceAsk = NonNullable<ScriptState['__placeAsk']>;

/** Yes puts the new place inside the old one, so moving between them is no change of place; either answer ends the ask. */
const answer = (api: GameApi, ask: PlaceAsk, yes: boolean) =>
  api.mutate((_, adv) => {
    const { __placeAsk: _done, ...rest } = adv.scriptState;
    adv.scriptState = rest;
    const inside = adv.entities.find((e) => e.kind === 'place' && e.name === ask.inside);
    if (yes && inside) adv.entities = adv.entities.map((e) => (e.kind === 'place' && e.name === ask.place && e !== inside ? { ...e, partOf: inside.id } : e));
  });

/** The turn read's scene, shown once it has written one. Edits last until a later passage says otherwise. */
export function SceneSection({
  scene: stored,
  entities,
  log,
  ask,
  api,
}: {
  scene: Scene;
  entities: readonly Entity[];
  log: NonNullable<PlotComponents['sceneLog']>;
  ask: PlaceAsk | undefined;
  api: GameApi;
}) {
  // Shown and edited as names; stored as ids where a card matches, so a rename carries over.
  const scene = sceneNames(stored, entities);
  const set = (patch: Partial<Scene>) => api.updatePlot({ scene: sceneIds({ ...scene, ...patch }, entities) });
  return (
    <Section title="Scene" tokens={tokenizer.count(renderScene(scene))} badge={<Pill tone="auto">auto</Pill>}>
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
      {ask && (
        <p className="text-caption flex items-center gap-2">
          <span className="grow">
            Is {ask.place} inside {ask.inside}?
          </span>
          <Button variant="ghost" onClick={() => answer(api, ask, true)}>
            Yes
          </Button>
          <Button variant="ghost" onClick={() => answer(api, ask, false)}>
            No
          </Button>
        </p>
      )}
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
    </Section>
  );
}
