import type { AdventureSettings } from '@core/model';
import { NumberInput } from './NumberInput';
import { Section, Setting } from './Section';
import { SettingSwitch } from './SettingSwitch';

type Settings = AdventureSettings;
type Update = (patch: Partial<Settings>) => void;

type ImageNumber = { label: string; key: 'width' | 'height' | 'steps' | 'cfgScale' | 'portraitSize' | 'portraitSteps'; step: number; min: number };
const IMAGE_NUMBERS: ImageNumber[] = [
  { label: 'Width', key: 'width', step: 64, min: 256 },
  { label: 'Height', key: 'height', step: 64, min: 256 },
  { label: 'Steps', key: 'steps', step: 1, min: 1 },
  { label: 'CFG scale', key: 'cfgScale', step: 0.5, min: 1 },
];
const PORTRAIT_NUMBERS: ImageNumber[] = [
  { label: 'Portrait size', key: 'portraitSize', step: 64, min: 256 },
  { label: 'Portrait steps', key: 'portraitSteps', step: 1, min: 1 },
];

/** Blank means "whatever the image server already has". */
const text = (value: string) => (value.trim() === '' ? undefined : value);

const IMAGE_TEXT_INPUT = 'h-8 w-45 rounded-sm border border-border bg-bar px-2 text-caption';

export function ImagesSection({ s, update }: { s: Settings; update: Update }) {
  const image = (patch: Partial<Settings['image']>) => update({ image: { ...s.image, ...patch } });
  const numbers = (list: ImageNumber[]) =>
    list.map((n) => (
      <Setting key={n.key} label={n.label} htmlFor={`img-${n.key}`}>
        <NumberInput
          id={`img-${n.key}`}
          step={n.step}
          min={n.min}
          value={s.image[n.key]}
          onCommit={(v) => {
            if (v !== undefined) image({ [n.key]: v });
          }}
        />
      </Setting>
    ));
  return (
    <Section title="Images">
      <Setting label="Checkpoint" htmlFor="img-model" title="Blank uses whatever the image server has loaded; names are listed by Test in Settings">
        <input id="img-model" className={IMAGE_TEXT_INPUT} value={s.image.model ?? ''} onChange={(e) => image({ model: text(e.target.value) })} />
      </Setting>
      {numbers(IMAGE_NUMBERS)}
      <Setting label="Negative prompt" htmlFor="img-neg">
        <input
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
        <input
          id="img-style"
          className={IMAGE_TEXT_INPUT}
          value={s.image.portraitStyle ?? ''}
          onChange={(e) => image({ portraitStyle: text(e.target.value) })}
        />
      </Setting>
    </Section>
  );
}
