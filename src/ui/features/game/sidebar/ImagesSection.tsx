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

type ImageText = { label: string; key: 'negativePrompt' | 'portraitStyle' | 'promptPrefix' | 'promptSuffix'; id: string; help: string };
const PROMPT_TEXTS: ImageText[] = [
  {
    label: 'Negative prompt',
    key: 'negativePrompt',
    id: 'img-neg',
    help: 'What the image should avoid, e.g. blurry, extra fingers, text. Blank sends nothing.',
  },
];
const STYLE_TEXTS: ImageText[] = [
  {
    label: 'Portrait style',
    key: 'portraitStyle',
    id: 'img-style',
    help: "Added to every See and portrait prompt; blank picks one from the adventure's tags, or none when a prompt prefix is set",
  },
  {
    label: 'Prompt prefix',
    key: 'promptPrefix',
    id: 'img-prefix',
    help: "Put before every See, portrait and cover prompt: the quality tags your checkpoint's page asks for",
  },
  {
    label: 'Prompt suffix',
    key: 'promptSuffix',
    id: 'img-suffix',
    help: 'Added to every See, portrait and cover prompt: style, nudity or gore words your checkpoint needs',
  },
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
  const texts = (list: ImageText[]) =>
    list.map((t) => (
      <Setting key={t.key} label={t.label} htmlFor={t.id} help={t.help}>
        <Input id={t.id} className={IMAGE_TEXT_INPUT} value={s.image[t.key] ?? ''} onChange={(e) => image({ [t.key]: text(e.target.value) })} />
      </Setting>
    ));
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
      {texts(PROMPT_TEXTS)}
      <SettingSwitch
        id="img-portraits"
        label="Character portraits"
        help="Drawn between turns, one character at a time"
        checked={s.image.portraits}
        onChange={(on) => image({ portraits: on })}
      />
      {numbers(PORTRAIT_NUMBERS)}
      {texts(STYLE_TEXTS)}
    </Section>
  );
}
