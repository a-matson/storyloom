import type { Adventure, PlotComponents } from '@core/model';
import { tokenizer } from '@app/services';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { Switch } from '@ui/components/ui/switch';
import { Textarea } from '@ui/components/ui/textarea';
import { MemoryStatus } from './MemoryStatus';
import { Section, SECTION, SECTION_HEADER } from './Section';

type TextKey = 'aiInstructions' | 'storySummary' | 'plotEssentials' | 'authorsNote';

const FIELDS: { key: TextKey; title: string; placeholder: string; open?: boolean }[] = [
  { key: 'aiInstructions', title: 'AI Instructions', placeholder: 'System prompt: how the AI should write.', open: true },
  { key: 'storySummary', title: 'Story Summary', placeholder: 'Maintained automatically every 15 actions; edit freely.' },
  { key: 'plotEssentials', title: 'Plot Essentials', placeholder: 'Key facts the AI must always remember.' },
  { key: 'authorsNote', title: "Author's Note", placeholder: 'Short guidance on style, tone and pacing.' },
];

function ThirdPerson({ plot, api }: { plot: PlotComponents; api: GameApi }) {
  const enabled = plot.thirdPerson?.enabled ?? false;
  const name = plot.thirdPerson?.name ?? '';
  return (
    <section className={SECTION}>
      <header className={SECTION_HEADER}>
        <span className="grow">Third person</span>
        <Input
          className="h-7 w-30 text-caption"
          placeholder="Name"
          aria-label="Third-person name"
          value={name}
          onChange={(e) => api.updatePlot({ thirdPerson: { enabled, name: e.target.value } })}
        />
        <Switch aria-label="Third person" checked={enabled} onChange={(on) => api.updatePlot({ thirdPerson: { enabled: on, name } })} />
      </header>
    </section>
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
        </Section>
      ))}
      <ThirdPerson plot={p} api={api} />
      <MemoryStatus adventure={adventure} utilityModel={utilityModel} />
    </>
  );
}
