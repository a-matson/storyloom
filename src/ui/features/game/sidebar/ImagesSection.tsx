import type { AdventureSettings, AppSettings } from '@core/model';
import { Input } from '@ui/components/ui/field';
import { ImagePresetRow } from './ImagePresetRow';
import { NumberInput } from './NumberInput';
import { Section, Setting } from './Section';
import { ServerChoice, useServerLists } from './ServerChoice';
import { SettingSwitch } from './SettingSwitch';

type Settings = AdventureSettings;
type Update = (patch: Partial<Settings>) => void;
type Props = { s: Settings; app: AppSettings; onAppChange: (next: AppSettings) => void; update: Update };
type NumberKey = 'width' | 'height' | 'steps' | 'cfgScale' | 'portraitSize' | 'portraitSteps' | 'clipSkip' | 'hiresScale' | 'hiresDenoise' | 'hiresSteps';

type ImageNumber = { label: string; key: NumberKey; step: number; min: number; max?: number; optional?: boolean };
const IMAGE_NUMBERS: ImageNumber[] = [
  { label: 'Width', key: 'width', step: 64, min: 256 },
  { label: 'Height', key: 'height', step: 64, min: 256 },
  { label: 'Steps', key: 'steps', step: 1, min: 1 },
  { label: 'CFG scale', key: 'cfgScale', step: 0.5, min: 1 },
  { label: 'Clip skip', key: 'clipSkip', step: 1, min: 1, max: 4, optional: true },
];
const HIRES_NUMBERS: ImageNumber[] = [
  { label: 'Hires scale', key: 'hiresScale', step: 0.25, min: 1, max: 2 },
  { label: 'Denoise', key: 'hiresDenoise', step: 0.05, min: 0.05, max: 1 },
  { label: 'Hires steps', key: 'hiresSteps', step: 1, min: 1, optional: true },
];
const PORTRAIT_NUMBERS: ImageNumber[] = [
  { label: 'Portrait size', key: 'portraitSize', step: 64, min: 256 },
  { label: 'Portrait steps', key: 'portraitSteps', step: 1, min: 1 },
];

/** Blank means "whatever the image server already has". */
const text = (value: string) => (value.trim() === '' ? undefined : value);

// The field primitive at the sidebar's control height, so text fields match the preset Select.
const IMAGE_TEXT_INPUT = 'h-8 w-45';

/**
 * Which checkpoint, and what its model page asks for. Checkpoint is hidden when the server has
 * only one (KoboldCpp's `--sdmodel`) and nothing is stored, since there is nothing to switch to.
 */
function ModelCard({ s, app, onAppChange, update }: Props) {
  const { models, samplers } = useServerLists(app);
  const image = (patch: Partial<Settings['image']>) => update({ image: { ...s.image, ...patch } });
  return (
    <>
      {(models?.length !== 1 || s.image.model !== undefined) && (
        <Setting label="Checkpoint" htmlFor="img-model" title="The model file to render with; Server default uses whatever the image server has loaded">
          <ServerChoice id="img-model" value={s.image.model} options={models} onChange={(model) => image({ model })} />
        </Setting>
      )}
      <ImagePresetRow image={s.image} onImage={(next) => update({ image: next })} app={app} onAppChange={onAppChange} />
      <Setting label="Sampler" htmlFor="img-sampler" title="As the checkpoint's page names it, e.g. DPM++ 2M Karras">
        <ServerChoice id="img-sampler" value={s.image.sampler} options={samplers} onChange={(sampler) => image({ sampler })} />
      </Setting>
    </>
  );
}

export function ImagesSection({ s, app, onAppChange, update }: Props) {
  const image = (patch: Partial<Settings['image']>) => update({ image: { ...s.image, ...patch } });
  const numbers = (list: ImageNumber[]) =>
    list.map((n) => (
      <Setting key={n.key} label={n.label} htmlFor={`img-${n.key}`}>
        <NumberInput
          id={`img-${n.key}`}
          step={n.step}
          min={n.min}
          max={n.max}
          optional={n.optional ?? false}
          value={s.image[n.key]}
          onCommit={(v) => {
            if (v !== undefined || n.optional) image({ [n.key]: v });
          }}
        />
      </Setting>
    ));
  return (
    <Section title="Images">
      <ModelCard s={s} app={app} onAppChange={onAppChange} update={update} />
      {numbers(IMAGE_NUMBERS)}
      <SettingSwitch
        id="img-hires"
        label="Hires pass"
        title="The model page's denoise: render, upscale, then redraw at that strength. Roughly doubles the time; never used for portraits"
        checked={s.image.hires}
        onChange={(on) => image({ hires: on })}
      />
      {s.image.hires && numbers(HIRES_NUMBERS)}
      <Setting label="Negative prompt" htmlFor="img-neg">
        <Input
          id="img-neg"
          className={IMAGE_TEXT_INPUT}
          value={s.image.negativePrompt ?? ''}
          onChange={(e) => image({ negativePrompt: text(e.target.value) })}
        />
      </Setting>
      <SettingSwitch
        id="img-portraits"
        label="Character portraits"
        title="Drawn between turns, one character at a time"
        checked={s.image.portraits}
        onChange={(on) => image({ portraits: on })}
      />
      {numbers(PORTRAIT_NUMBERS)}
      <Setting label="Portrait style" htmlFor="img-style" title="Added to every portrait prompt; blank picks one from the adventure's tags">
        <Input
          id="img-style"
          className={IMAGE_TEXT_INPUT}
          value={s.image.portraitStyle ?? ''}
          onChange={(e) => image({ portraitStyle: text(e.target.value) })}
        />
      </Setting>
    </Section>
  );
}
