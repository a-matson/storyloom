import { useState } from 'react';
import { applyImagePreset, IMAGE_PRESETS, presetFrom, savePreset } from '@core/imagePresets';
import type { AdventureSettings, AppSettings } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';
import { Setting } from './Section';

type ImageSettings = AdventureSettings['image'];

interface Props {
  image: ImageSettings;
  onImage: (next: ImageSettings) => void;
  app: AppSettings;
  onAppChange: (next: AppSettings) => void;
}

type Mode = 'idle' | 'naming' | 'deleting';

/** Name field with Save/Cancel; Enter saves, Escape cancels. An existing name is replaced. */
function NameForm({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() !== '') onSave(name.trim());
      }}
    >
      <Input
        aria-label="Preset name"
        className="h-8 grow"
        placeholder="Preset name"
        // A field the player just asked for; focusing it is the point of the click.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Button type="submit" disabled={name.trim() === ''}>
        Save
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/** Built-in and saved presets. Saved ones live in app settings, so every adventure sees them. */
export function ImagePresetRow({ image, onImage, app, onAppChange }: Props) {
  const [chosen, setChosen] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const saved = app.imagePresets;
  const mine = saved.find((p) => p.id === chosen);

  const save = (name: string) => {
    const presets = savePreset(saved, presetFrom(image, name));
    onAppChange({ ...app, imagePresets: presets });
    setChosen(presets.find((p) => p.name === name)?.id ?? '');
    setMode('idle');
  };
  const remove = () => {
    onAppChange({ ...app, imagePresets: saved.filter((p) => p !== mine) });
    setChosen('');
    setMode('idle');
  };

  return (
    <>
      <Setting label="Apply preset" htmlFor="img-preset" title="Sampler, steps, CFG, clip skip and hires pass as checkpoint pages usually give them">
        <Select
          id="img-preset"
          className="h-8 w-45"
          value={chosen}
          onChange={(e) => {
            const p = [...IMAGE_PRESETS, ...saved].find((x) => x.id === e.target.value);
            setChosen(e.target.value);
            if (p) onImage(applyImagePreset(image, p));
          }}
        >
          <option value="">Choose…</option>
          {IMAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {saved.length > 0 && (
            <optgroup label="Saved">
              {saved.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </Setting>
      {mode === 'naming' && <NameForm initial={mine?.name ?? ''} onSave={save} onCancel={() => setMode('idle')} />}
      {mode === 'deleting' && mine && (
        <div className="flex items-center justify-end gap-2">
          <span className="grow text-caption">Delete “{mine.name}”?</span>
          <Button danger onClick={remove}>
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setMode('idle')}>
            Cancel
          </Button>
        </div>
      )}
      {mode === 'idle' && (
        <div className="flex justify-end gap-2">
          {mine && (
            <Button variant="ghost" danger onClick={() => setMode('deleting')}>
              Delete preset
            </Button>
          )}
          <Button onClick={() => setMode('naming')} title="Save sampler, steps, CFG, clip skip and the hires pass under a name, for every adventure">
            Save as preset
          </Button>
        </div>
      )}
    </>
  );
}
