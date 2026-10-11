import { renderScene } from '@core/context';
import type { PlotComponents, Scene } from '@core/model';
import { tokenizer } from '@app/services';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { Section } from './Section';

const list = (s: string) =>
  s
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

/** Location changes shown under the scene. */
const TIMELINE = 5;

/** The turn read's scene, shown once it has written one. Edits last until a later passage says otherwise. */
export function SceneSection({ scene, log, api }: { scene: Scene; log: NonNullable<PlotComponents['sceneLog']>; api: GameApi }) {
  const set = (patch: Partial<Scene>) => api.updatePlot({ scene: { ...scene, ...patch } });
  return (
    <Section title="Scene" tokens={tokenizer.count(renderScene(scene))} badge={<Pill tone="auto">auto</Pill>}>
      <Input
        aria-label="Scene location"
        className="text-control"
        placeholder="Where the story is"
        value={scene.location ?? ''}
        onChange={(e) => set({ location: e.target.value })}
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
      <Input
        aria-label="Weather"
        className="text-control"
        placeholder="Weather"
        value={scene.weather ?? ''}
        onChange={(e) => set({ weather: e.target.value })}
      />
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
