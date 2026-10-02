import type { Scenario } from '@core/model';
import { TextField, type TabProps } from './fields';

type Scripts = NonNullable<Scenario['scripts']>;
const EMPTY: Scripts = { library: '', input: '', context: '', output: '' };
const HOOKS: { key: keyof Scripts; label: string }[] = [
  { key: 'library', label: 'Library' },
  { key: 'input', label: 'Input' },
  { key: 'context', label: 'Context' },
  { key: 'output', label: 'Output' },
];

export function ScriptsTab({ draft, update }: TabProps) {
  const scripts = draft.scripts ?? EMPTY;
  return (
    <>
      <p className="m-0 text-caption text-muted-foreground">Scripts are saved with the scenario; they run from milestone 6.</p>
      {HOOKS.map((h) => (
        <TextField key={h.key} label={h.label} className="font-mono" value={scripts[h.key]} onChange={(v) => update({ scripts: { ...scripts, [h.key]: v } })} />
      ))}
    </>
  );
}
