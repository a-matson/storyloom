import type { CardGeneratorSettings } from '@core/cards';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Switch } from '@ui/components/ui/switch';
import { Textarea } from '@ui/components/ui/textarea';

type Flag = 'speedCreate' | 'includeSummary' | 'logToNotes';

const FLAGS: { key: Flag; label: string; hint?: string }[] = [
  { key: 'speedCreate', label: 'Speed create mode', hint: 'Finish becomes Next' },
  { key: 'includeSummary', label: 'Include Story Summary' },
  { key: 'logToNotes', label: 'Log generations in Notes' },
];

/** Per-adventure card generator settings (AI Dungeon's Generator Settings tab). */
export function GeneratorSettings({ settings, onChange }: { settings: CardGeneratorSettings; onChange: (s: CardGeneratorSettings) => void }) {
  const set = (patch: Partial<CardGeneratorSettings>) => onChange({ ...settings, ...patch });
  return (
    <>
      {FLAGS.map((f) => (
        <div key={f.key} className="flex items-center gap-2.5 text-control">
          <label htmlFor={`gen-${f.key}`} className="grow">
            {f.label}
          </label>
          {f.hint !== undefined && <span className="text-caption text-muted-foreground">{f.hint}</span>}
          <Switch id={`gen-${f.key}`} checked={settings[f.key]} onChange={(on) => set({ [f.key]: on })} />
        </div>
      ))}
      <label htmlFor="gen-instructions" className="flex flex-col gap-2">
        <SectionLabel>AI instructions</SectionLabel>
        <Textarea
          id="gen-instructions"
          value={settings.aiInstructions}
          onChange={(e) => set({ aiInstructions: e.target.value })}
          placeholder="Write in a noir style with short, punchy sentences. Focus on morally ambiguous characters."
        />
      </label>
      <label htmlFor="gen-story" className="flex flex-col gap-2">
        <SectionLabel>Story information</SectionLabel>
        <Textarea
          id="gen-story"
          className="min-h-30"
          value={settings.storyInformation}
          onChange={(e) => set({ storyInformation: e.target.value })}
          placeholder="Setting, lore, your character and companions, factions, magic or technology…"
        />
      </label>
      <p className="m-0 text-caption text-muted-foreground">
        These settings are saved with this adventure. Generation runs on your story backend (slot 1) and uses JSON-schema constrained output when the backend
        supports it.
      </p>
    </>
  );
}
