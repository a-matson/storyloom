import type { ModelSettings as Model } from '@core/model';
import { NumberInput } from './NumberInput';
import { Section, Setting } from './Section';

type NumKey = { [K in keyof Model]-?: Model[K] extends number | undefined ? K : never }[keyof Model];

const NUMBERS: { label: string; key: NumKey; step: number; min: number; max?: number }[] = [
  { label: 'Response length', key: 'responseLength', step: 10, min: 16, max: 2048 },
  { label: 'Temperature', key: 'temperature', step: 0.05, min: 0, max: 3 },
  { label: 'Top K', key: 'topK', step: 10, min: 0 },
  { label: 'Top P', key: 'topP', step: 0.01, min: 0, max: 1 },
  { label: 'Min P', key: 'minP', step: 0.01, min: 0, max: 1 },
  { label: 'Presence penalty', key: 'presencePenalty', step: 0.05, min: -2, max: 2 },
  { label: 'Frequency penalty', key: 'frequencyPenalty', step: 0.05, min: -2, max: 2 },
  { label: 'Repetition penalty', key: 'repetitionPenalty', step: 0.01, min: 0.5, max: 2 },
  { label: 'Seed (blank = random)', key: 'seed', step: 1, min: 0 },
];

export function ModelSettings({ model, onChange }: { model: Model; onChange: (patch: Partial<Model>) => void }) {
  return (
    <Section title="Model settings">
      {NUMBERS.map((n) => (
        <Setting key={n.key} label={n.label} htmlFor={`m-${n.key}`}>
          <NumberInput id={`m-${n.key}`} step={n.step} min={n.min} max={n.max} optional value={model[n.key]} onCommit={(v) => onChange({ [n.key]: v })} />
        </Setting>
      ))}
    </Section>
  );
}
