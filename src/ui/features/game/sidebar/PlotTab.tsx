import type { Adventure } from '@core/model';
import { tokenizer } from '@app/services';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Pill } from '@ui/components/ui/pill';
import { Textarea } from '@ui/components/ui/textarea';
import { MemoryStatus } from './MemoryStatus';
import { Section } from './Section';

type TextKey = 'aiInstructions' | 'storySummary' | 'plotEssentials' | 'authorsNote';

const FIELDS: { key: TextKey; title: string; placeholder: string; open?: boolean }[] = [
  { key: 'aiInstructions', title: 'AI Instructions', placeholder: 'System prompt: how the AI should write.', open: true },
  { key: 'storySummary', title: 'Story Summary', placeholder: 'Maintained automatically as older text leaves the context; edit freely.' },
  { key: 'plotEssentials', title: 'Plot Essentials', placeholder: 'Key facts the AI must always remember.' },
  { key: 'authorsNote', title: "Author's Note", placeholder: 'Short guidance on style, tone and pacing.' },
];

function SummaryCadence() {
  return (
    <p className="text-caption text-muted-foreground">Updates when older text leaves the context. Your edits are kept as the base for the next summary.</p>
  );
}

export function PlotTab({ adventure, api, utilityModel }: { adventure: Adventure; api: GameApi; utilityModel: boolean }) {
  const p = adventure.plot;
  return (
    <>
      {FIELDS.map((f) => (
        <Section
          key={f.key}
          title={f.title}
          tokens={tokenizer.count(p[f.key] ?? '')}
          defaultOpen={f.open ?? false}
          badge={f.key === 'storySummary' && adventure.settings.memory.autoSummary ? <Pill tone="auto">auto</Pill> : undefined}
        >
          <Textarea
            className="text-control"
            aria-label={f.title}
            value={p[f.key] ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => api.updatePlot({ [f.key]: e.target.value })}
          />
          {f.key === 'storySummary' && adventure.settings.memory.autoSummary && <SummaryCadence />}
        </Section>
      ))}
      {p.scene && <p className="text-caption text-muted-foreground">Scene and cast: World tab.</p>}
      <MemoryStatus adventure={adventure} utilityModel={utilityModel} />
    </>
  );
}
