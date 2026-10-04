import { useState } from 'react';
import type { Scenario } from '@core/model';
import { Segmented } from '@ui/components/ui/drawer';
import { TextField, type TabProps } from './fields';
import { ConsoleLog, appendLog } from './ConsoleLog';
import { ScriptTest } from './ScriptTest';

type Scripts = NonNullable<Scenario['scripts']>;
const EMPTY: Scripts = { library: '', input: '', context: '', output: '' };
export const HOOKS: { id: keyof Scripts; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'input', label: 'Input' },
  { id: 'context', label: 'Context' },
  { id: 'output', label: 'Output' },
];

export function ScriptsTab({ draft, update }: TabProps) {
  const scripts = draft.scripts ?? EMPTY;
  const [tab, setTab] = useState<keyof Scripts>('library');
  const [log, setLog] = useState<string[]>([]);
  const label = HOOKS.find((h) => h.id === tab)?.label ?? tab;
  return (
    <div className="flex grow gap-6 max-lg:flex-col">
      <div className="flex min-w-0 grow flex-col gap-3">
        <Segmented value={tab} options={HOOKS} onChange={setTab} />
        <p className="m-0 text-caption text-muted-foreground">
          Scripts are copied into every adventure started from this scenario and run in a sandbox while you play.
        </p>
        <TextField
          label={label}
          hint={tab === 'library' ? 'shared functions, prepended to every hook' : 'must end in modifier(text)'}
          className="min-h-50 font-mono"
          value={scripts[tab]}
          onChange={(v) => update({ scripts: { ...scripts, [tab]: v } })}
        />
      </div>
      <aside aria-label="Script tools" className="flex w-105 shrink-0 flex-col gap-4 max-lg:w-full max-lg:shrink">
        <ScriptTest
          tab={tab}
          scripts={scripts}
          cards={draft.storyCards}
          plotEssentials={draft.plot.plotEssentials ?? ''}
          onLogs={(hook, lines) => setLog((l) => appendLog(l, hook, lines))}
        />
        <ConsoleLog lines={log} onClear={() => setLog([])} />
      </aside>
    </div>
  );
}
