import { renderScene } from '@core/context';
import { DayPart } from '@core/schema';
import type { Scene } from '@core/model';
import { tokenizer } from '@app/services';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input, Select } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { NumberInput } from './NumberInput';
import { Section, Setting } from './Section';

const list = (s: string) =>
  s
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

/** The memory jobs' scene, shown once they have written one. Edits last until a later passage says otherwise. */
export function SceneSection({ scene, api }: { scene: Scene; api: GameApi }) {
  const set = (patch: Partial<Scene>) => api.updatePlot({ scene: { ...scene, ...patch } });
  const time = scene.time;
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
      <Setting label="Time of day" htmlFor="scene-part">
        <Select
          id="scene-part"
          className="h-8 w-30 text-caption"
          value={time?.part ?? ''}
          onChange={(e) => {
            const part = DayPart.safeParse(e.target.value);
            if (part.success) set({ time: { day: time?.day ?? 1, part: part.data } });
          }}
        >
          {!time && <option value="">Unknown</option>}
          {DayPart.options.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </Select>
      </Setting>
      {time && (
        <Setting label="Day" htmlFor="scene-day">
          <NumberInput id="scene-day" value={time.day} min={1} step={1} onCommit={(day) => day !== undefined && set({ time: { ...time, day } })} />
        </Setting>
      )}
      <Input
        aria-label="Weather"
        className="text-control"
        placeholder="Weather"
        value={scene.weather ?? ''}
        onChange={(e) => set({ weather: e.target.value })}
      />
    </Section>
  );
}
