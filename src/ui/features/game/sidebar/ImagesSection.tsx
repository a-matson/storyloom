import type { AdventureSettings, AppSettings } from '@core/model';
import { Input } from '@ui/components/ui/field';
import { ImagePresetRow } from './ImagePresetRow';
import { NumberInput } from './NumberInput';
import { describedBy, Section, Setting } from './Section';
import { ServerChoice, useServerLists } from './ServerChoice';
import { IMAGE_HELP, type ImageNumberKey } from './settingHelp';
import { SettingSwitch } from './SettingSwitch';

type Settings = AdventureSettings;
type Update = (patch: Partial<Settings>) => void;
type Props = { s: Settings; app: AppSettings; onAppChange: (next: AppSettings) => void; update: Update };

type ImageNumber = { label: string; key: ImageNumberKey; step: number; min: number; max?: number; optional?: boolean };
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
  { label: 'Sheet steps', key: 'sheetSteps', step: 1, min: 1 },
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
        <Setting label="Checkpoint" htmlFor="img-model" help="The model file to render with; Server default uses whatever the image server has loaded">
          <ServerChoice id="img-model" value={s.image.model} options={models} onChange={(model) => image({ model })} />
        </Setting>
      )}
      <ImagePresetRow image={s.image} onImage={(next) => update({ image: next })} app={app} onAppChange={onAppChange} />
      <Setting
        label="Sampler"
        htmlFor="img-sampler"
        help="As the checkpoint's page names it, e.g. DPM++ 2M Karras. Server default uses the image server's own."
      >
        <ServerChoice id="img-sampler" value={s.image.sampler} options={samplers} onChange={(sampler) => image({ sampler })} />
      </Setting>
    </>
  );
}

export function ImagesSection({ s, app, onAppChange, update }: Props) {
  const image = (patch: Partial<Settings['image']>) => update({ image: { ...s.image, ...patch } });
  const numbers = (list: ImageNumber[]) =>
    list.map((n) => {
      const id = `img-${n.key}`;
      const { help, warn } = IMAGE_HELP[n.key];
      const warning = warn?.(s.image[n.key], s.image);
      return (
        <Setting key={n.key} label={n.label} htmlFor={id} help={help} warn={warning}>
          <NumberInput
            id={id}
            step={n.step}
            min={n.min}
            max={n.max}
            optional={n.optional ?? false}
            describedBy={describedBy(id, help, warning)}
            value={s.image[n.key]}
            onCommit={(v) => {
              if (v !== undefined || n.optional) image({ [n.key]: v });
            }}
          />
        </Setting>
      );
    });
  return (
    <Section title="Images">
      <ModelCard s={s} app={app} onAppChange={onAppChange} update={update} />
      {numbers(IMAGE_NUMBERS)}
      <SettingSwitch
        id="img-hires"
        label="Hires pass"
        help="The model page's denoise: render, upscale, then redraw at that strength. Roughly doubles the time; never used for portraits"
        checked={s.image.hires}
        onChange={(on) => image({ hires: on })}
      />
      {s.image.hires && numbers(HIRES_NUMBERS)}
      <Setting label="Negative prompt" htmlFor="img-neg" help="What the image should avoid, e.g. blurry, extra fingers, text. Blank sends nothing.">
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
        help="Drawn between turns, one character at a time"
        checked={s.image.portraits}
        onChange={(on) => image({ portraits: on })}
      />
      {numbers(PORTRAIT_NUMBERS)}
      <Setting label="Portrait style" htmlFor="img-style" help="Added to every portrait prompt; blank picks one from the adventure's tags">
        <Input
          id="img-style"
          className={IMAGE_TEXT_INPUT}
          value={s.image.portraitStyle ?? ''}
          onChange={(e) => image({ portraitStyle: text(e.target.value) })}
        />
      </Setting>
      <Setting
        label="Prompt suffix"
        htmlFor="img-suffix"
        help="Added to every See, portrait and cover prompt: style, nudity or gore words your checkpoint needs"
      >
        <Input
          id="img-suffix"
          className={IMAGE_TEXT_INPUT}
          value={s.image.promptSuffix ?? ''}
          onChange={(e) => image({ promptSuffix: text(e.target.value) })}
        />
      </Setting>
    </Section>
  );
}
