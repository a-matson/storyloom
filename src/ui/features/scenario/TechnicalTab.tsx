import type { PlotComponents } from '@core/model';
import { TextField, type TabProps } from './fields';

export function TechnicalTab({ draft, update }: TabProps) {
  const plot = (patch: Partial<PlotComponents>) => update({ plot: { ...draft.plot, ...patch } });
  return (
    <>
      <TextField
        label="Prompt"
        hint="first action of the adventure · the AI continues from here"
        className="min-h-50 font-display text-body"
        value={draft.prompt}
        onChange={(prompt) => update({ prompt })}
        tokens
      />
      <div className="grid grid-cols-2 gap-4.5 max-sm:grid-cols-1">
        <TextField label="Plot Essentials" className="min-h-30" value={draft.plot.plotEssentials ?? ''} onChange={(v) => plot({ plotEssentials: v })} tokens />
        <TextField label="Author's Note" className="min-h-30" value={draft.plot.authorsNote ?? ''} onChange={(v) => plot({ authorsNote: v })} tokens />
      </div>
      <TextField
        label="AI Instructions"
        hint="system prompt · players can edit later"
        value={draft.plot.aiInstructions ?? ''}
        onChange={(v) => plot({ aiInstructions: v })}
        tokens
      />
    </>
  );
}
